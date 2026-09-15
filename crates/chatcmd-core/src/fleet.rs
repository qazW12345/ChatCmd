use std::{collections::BTreeSet, fmt};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::AgentId;

/// Lossless identifier for a source-control revision.
///
/// Fleet intentionally does not assume SHA-1 length or hexadecimal syntax. The
/// source-control provider owns the identifier format; Fleet only requires a
/// non-empty value and exact equality at review and CI gates.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize), serde(transparent))]
pub struct RevisionId(String);

impl RevisionId {
    /// Preserves an externally supplied revision identifier losslessly.
    pub fn new(value: impl Into<String>) -> Result<Self, FleetDomainError> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(FleetDomainError::EmptyRevisionId);
        }
        Ok(Self(value))
    }

    /// Returns the exact external representation.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RevisionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// The immutable base and mutable candidate head for one Fleet change set.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct FleetCandidate {
    pub base: RevisionId,
    pub head: RevisionId,
}

/// Outcome issued by an independent reviewer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "snake_case")
)]
pub enum ReviewVerdict {
    Pass,
    Fail,
}

/// Independent-review evidence tied to one exact candidate head.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct IndependentReview {
    pub candidate_head: RevisionId,
    pub reviewer: AgentId,
    pub verdict: ReviewVerdict,
    pub summary: Option<String>,
}

/// Normalized conclusion of one CI check.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "snake_case")
)]
pub enum CheckConclusion {
    Pending,
    Success,
    Failure,
}

/// CI evidence tied to one exact candidate head.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct CiCheckEvidence {
    pub candidate_head: RevisionId,
    pub name: String,
    pub conclusion: CheckConclusion,
}

impl CiCheckEvidence {
    /// Constructs CI evidence while rejecting an empty check name.
    pub fn new(
        candidate_head: RevisionId,
        name: impl Into<String>,
        conclusion: CheckConclusion,
    ) -> Result<Self, FleetDomainError> {
        let name = name.into();
        if name.trim().is_empty() {
            return Err(FleetDomainError::EmptyCheckName);
        }
        Ok(Self {
            candidate_head,
            name,
            conclusion,
        })
    }
}

/// Durable gate state for a candidate under Fleet supervision.
///
/// Evidence is accepted only for the current candidate head. Moving the head
/// invalidates all previously recorded review and CI evidence so stale approval
/// cannot accidentally authorize a changed candidate.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct CandidateGate {
    candidate: FleetCandidate,
    independent_review: Option<IndependentReview>,
    checks: Vec<CiCheckEvidence>,
}

impl CandidateGate {
    #[must_use]
    pub fn new(base: RevisionId, head: RevisionId) -> Self {
        Self {
            candidate: FleetCandidate { base, head },
            independent_review: None,
            checks: Vec::new(),
        }
    }

    #[must_use]
    pub fn candidate(&self) -> &FleetCandidate {
        &self.candidate
    }

    #[must_use]
    pub fn independent_review(&self) -> Option<&IndependentReview> {
        self.independent_review.as_ref()
    }

    #[must_use]
    pub fn checks(&self) -> &[CiCheckEvidence] {
        &self.checks
    }

    /// Moves the candidate to a new head and invalidates stale evidence.
    ///
    /// Re-applying the same exact head is a no-op and preserves valid evidence.
    pub fn set_head(&mut self, head: RevisionId) {
        if self.candidate.head == head {
            return;
        }
        self.candidate.head = head;
        self.independent_review = None;
        self.checks.clear();
    }

    /// Records independent-review evidence for the exact current head.
    pub fn record_independent_review(
        &mut self,
        review: IndependentReview,
    ) -> Result<(), FleetDomainError> {
        if review.candidate_head != self.candidate.head {
            return Err(FleetDomainError::ReviewHeadMismatch {
                expected: self.candidate.head.clone(),
                actual: review.candidate_head,
            });
        }
        self.independent_review = Some(review);
        Ok(())
    }

    /// Records or replaces a named CI check for the exact current head.
    pub fn record_check(&mut self, check: CiCheckEvidence) -> Result<(), FleetDomainError> {
        if check.candidate_head != self.candidate.head {
            return Err(FleetDomainError::CheckHeadMismatch {
                expected: self.candidate.head.clone(),
                actual: check.candidate_head,
            });
        }
        if check.name.trim().is_empty() {
            return Err(FleetDomainError::EmptyCheckName);
        }

        if let Some(existing) = self.checks.iter_mut().find(|item| item.name == check.name) {
            *existing = check;
        } else {
            self.checks.push(check);
        }
        Ok(())
    }

    /// Evaluates merge readiness for the required CI check names.
    ///
    /// This method re-checks exact-head equality even though normal mutation
    /// methods already enforce it. That makes deserialized or migrated state
    /// fail closed if stale evidence somehow exists on disk.
    #[must_use]
    pub fn merge_readiness(&self, required_checks: &[String]) -> MergeReadiness {
        let mut blockers = Vec::new();

        match &self.independent_review {
            None => blockers.push(GateBlocker::IndependentReviewMissing),
            Some(review) if review.candidate_head != self.candidate.head => {
                blockers.push(GateBlocker::IndependentReviewHeadMismatch {
                    expected: self.candidate.head.clone(),
                    actual: review.candidate_head.clone(),
                });
            }
            Some(review) if review.verdict == ReviewVerdict::Fail => {
                blockers.push(GateBlocker::IndependentReviewFailed);
            }
            Some(_) => {}
        }

        let mut seen = BTreeSet::new();
        for required in required_checks {
            if !seen.insert(required.as_str()) {
                continue;
            }

            match self.checks.iter().find(|check| check.name == required.as_str()) {
                None => blockers.push(GateBlocker::RequiredCheckMissing(required.clone())),
                Some(check) if check.candidate_head != self.candidate.head => {
                    blockers.push(GateBlocker::CheckHeadMismatch {
                        name: required.clone(),
                        expected: self.candidate.head.clone(),
                        actual: check.candidate_head.clone(),
                    });
                }
                Some(check) => match check.conclusion {
                    CheckConclusion::Pending => {
                        blockers.push(GateBlocker::RequiredCheckPending(required.clone()));
                    }
                    CheckConclusion::Failure => {
                        blockers.push(GateBlocker::RequiredCheckFailed(required.clone()));
                    }
                    CheckConclusion::Success => {}
                },
            }
        }

        MergeReadiness {
            ready: blockers.is_empty(),
            blockers,
        }
    }
}

/// Fail-closed reasons preventing a candidate from being accepted.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", tag = "kind", content = "detail")
)]
pub enum GateBlocker {
    IndependentReviewMissing,
    IndependentReviewFailed,
    IndependentReviewHeadMismatch {
        expected: RevisionId,
        actual: RevisionId,
    },
    RequiredCheckMissing(String),
    RequiredCheckPending(String),
    RequiredCheckFailed(String),
    CheckHeadMismatch {
        name: String,
        expected: RevisionId,
        actual: RevisionId,
    },
}

/// Result of evaluating all currently configured acceptance gates.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct MergeReadiness {
    pub ready: bool,
    pub blockers: Vec<GateBlocker>,
}

/// Validation errors for Fleet domain state.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum FleetDomainError {
    #[error("revision identifier cannot be empty")]
    EmptyRevisionId,
    #[error("CI check name cannot be empty")]
    EmptyCheckName,
    #[error("review targets {actual}, but current candidate head is {expected}")]
    ReviewHeadMismatch {
        expected: RevisionId,
        actual: RevisionId,
    },
    #[error("CI check targets {actual}, but current candidate head is {expected}")]
    CheckHeadMismatch {
        expected: RevisionId,
        actual: RevisionId,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn revision(value: &str) -> RevisionId {
        RevisionId::new(value).expect("test revision should be valid")
    }

    fn reviewer() -> AgentId {
        AgentId::new("reviewer-sol-high").expect("test reviewer should be valid")
    }

    fn passing_review(head: &RevisionId) -> IndependentReview {
        IndependentReview {
            candidate_head: head.clone(),
            reviewer: reviewer(),
            verdict: ReviewVerdict::Pass,
            summary: Some("adversarial review passed".to_owned()),
        }
    }

    fn check(head: &RevisionId, name: &str, conclusion: CheckConclusion) -> CiCheckEvidence {
        CiCheckEvidence::new(head.clone(), name, conclusion).expect("test check should be valid")
    }

    #[test]
    fn revision_identifier_is_preserved_losslessly() {
        let value = "sha256:ABCDEF/opaque-provider-id";
        let id = revision(value);
        assert_eq!(id.as_str(), value);
    }

    #[test]
    fn empty_revision_identifier_is_rejected() {
        assert_eq!(
            RevisionId::new("  ").expect_err("whitespace-only revision must fail"),
            FleetDomainError::EmptyRevisionId
        );
    }

    #[test]
    fn gate_requires_review_and_all_required_checks() {
        let head = revision("candidate-1");
        let mut gate = CandidateGate::new(revision("base"), head.clone());
        let required = vec!["test".to_owned(), "lint".to_owned()];

        let initial = gate.merge_readiness(&required);
        assert!(!initial.ready);
        assert!(initial.blockers.contains(&GateBlocker::IndependentReviewMissing));
        assert!(
            initial
                .blockers
                .contains(&GateBlocker::RequiredCheckMissing("test".to_owned()))
        );

        gate.record_independent_review(passing_review(&head))
            .expect("current-head review should be accepted");
        gate.record_check(check(&head, "test", CheckConclusion::Success))
            .expect("current-head check should be accepted");
        gate.record_check(check(&head, "lint", CheckConclusion::Success))
            .expect("current-head check should be accepted");

        assert_eq!(
            gate.merge_readiness(&required),
            MergeReadiness {
                ready: true,
                blockers: Vec::new(),
            }
        );
    }

    #[test]
    fn changing_candidate_head_invalidates_review_and_ci_evidence() {
        let head = revision("candidate-1");
        let mut gate = CandidateGate::new(revision("base"), head.clone());
        gate.record_independent_review(passing_review(&head))
            .expect("current-head review should be accepted");
        gate.record_check(check(&head, "test", CheckConclusion::Success))
            .expect("current-head check should be accepted");

        gate.set_head(revision("candidate-2"));

        assert!(gate.independent_review().is_none());
        assert!(gate.checks().is_empty());
        let readiness = gate.merge_readiness(&["test".to_owned()]);
        assert!(!readiness.ready);
        assert!(
            readiness
                .blockers
                .contains(&GateBlocker::IndependentReviewMissing)
        );
    }

    #[test]
    fn setting_same_head_preserves_valid_evidence() {
        let head = revision("candidate-1");
        let mut gate = CandidateGate::new(revision("base"), head.clone());
        gate.record_independent_review(passing_review(&head))
            .expect("current-head review should be accepted");
        gate.record_check(check(&head, "test", CheckConclusion::Success))
            .expect("current-head check should be accepted");

        gate.set_head(head);

        assert!(gate.independent_review().is_some());
        assert_eq!(gate.checks().len(), 1);
    }

    #[test]
    fn stale_review_is_rejected_at_record_time() {
        let head = revision("candidate-2");
        let mut gate = CandidateGate::new(revision("base"), head.clone());
        let stale = passing_review(&revision("candidate-1"));

        assert_eq!(
            gate.record_independent_review(stale)
                .expect_err("stale review must fail"),
            FleetDomainError::ReviewHeadMismatch {
                expected: head,
                actual: revision("candidate-1"),
            }
        );
    }

    #[test]
    fn stale_ci_evidence_is_rejected_at_record_time() {
        let head = revision("candidate-2");
        let mut gate = CandidateGate::new(revision("base"), head.clone());
        let stale = check(&revision("candidate-1"), "test", CheckConclusion::Success);

        assert_eq!(
            gate.record_check(stale)
                .expect_err("stale check must fail"),
            FleetDomainError::CheckHeadMismatch {
                expected: head,
                actual: revision("candidate-1"),
            }
        );
    }

    #[test]
    fn latest_result_replaces_same_named_ci_check() {
        let head = revision("candidate-1");
        let mut gate = CandidateGate::new(revision("base"), head.clone());
        gate.record_independent_review(passing_review(&head))
            .expect("current-head review should be accepted");
        gate.record_check(check(&head, "test", CheckConclusion::Pending))
            .expect("pending check should be accepted");
        gate.record_check(check(&head, "test", CheckConclusion::Success))
            .expect("updated check should be accepted");

        assert_eq!(gate.checks().len(), 1);
        assert!(gate.merge_readiness(&["test".to_owned()]).ready);
    }

    #[test]
    fn failed_review_and_failed_check_both_block_acceptance() {
        let head = revision("candidate-1");
        let mut gate = CandidateGate::new(revision("base"), head.clone());
        gate.record_independent_review(IndependentReview {
            candidate_head: head.clone(),
            reviewer: reviewer(),
            verdict: ReviewVerdict::Fail,
            summary: Some("counterexample found".to_owned()),
        })
        .expect("current-head review should be accepted as evidence");
        gate.record_check(check(&head, "test", CheckConclusion::Failure))
            .expect("current-head failed check should be accepted as evidence");

        let readiness = gate.merge_readiness(&["test".to_owned()]);
        assert!(!readiness.ready);
        assert!(
            readiness
                .blockers
                .contains(&GateBlocker::IndependentReviewFailed)
        );
        assert!(
            readiness
                .blockers
                .contains(&GateBlocker::RequiredCheckFailed("test".to_owned()))
        );
    }
}
