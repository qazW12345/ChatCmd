use chatcmd_core::{
    AgentId, CandidateGate, CheckConclusion, CiCheckEvidence, FleetDomainError, GateBlocker,
    IndependentReview, MergeReadiness, ReviewVerdict, RevisionId,
};

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
        summary: Some("independent review passed".to_owned()),
    }
}

fn successful_check(head: &RevisionId, name: &str) -> CiCheckEvidence {
    CiCheckEvidence::new(head.clone(), name, CheckConclusion::Success)
        .expect("test check should be valid")
}

#[test]
fn public_api_reaches_ready_only_for_one_exact_head() {
    let head = revision("candidate-a");
    let mut gate = CandidateGate::new(revision("base"), head.clone());
    gate.record_independent_review(passing_review(&head))
        .expect("review should target current head");
    gate.record_check(successful_check(&head, "test"))
        .expect("check should target current head");

    assert_eq!(
        gate.merge_readiness(&["test".to_owned()]),
        MergeReadiness {
            ready: true,
            blockers: Vec::new(),
        }
    );

    gate.set_head(revision("candidate-b"));

    let readiness = gate.merge_readiness(&["test".to_owned()]);
    assert!(!readiness.ready);
    assert!(readiness.blockers.contains(&GateBlocker::IndependentReviewMissing));
    assert!(
        readiness
            .blockers
            .contains(&GateBlocker::RequiredCheckMissing("test".to_owned()))
    );
}

#[test]
fn gate_blocker_newtype_variant_round_trips_through_json() {
    let blocker = GateBlocker::RequiredCheckMissing("cargo-test".to_owned());
    let json = serde_json::to_string(&blocker).expect("blocker should serialize");
    let decoded: GateBlocker = serde_json::from_str(&json).expect("blocker should deserialize");

    assert_eq!(decoded, blocker);
}

#[test]
fn duplicate_required_check_names_do_not_duplicate_blockers() {
    let gate = CandidateGate::new(revision("base"), revision("candidate"));
    let readiness = gate.merge_readiness(&[
        "test".to_owned(),
        "test".to_owned(),
        "lint".to_owned(),
    ]);

    assert_eq!(
        readiness
            .blockers
            .iter()
            .filter(|blocker| {
                **blocker == GateBlocker::RequiredCheckMissing("test".to_owned())
            })
            .count(),
        1
    );
}

#[test]
fn deserialized_or_external_empty_check_name_is_rejected_at_record_time() {
    let head = revision("candidate");
    let mut gate = CandidateGate::new(revision("base"), head.clone());
    let check = CiCheckEvidence {
        candidate_head: head,
        name: "   ".to_owned(),
        conclusion: CheckConclusion::Success,
    };

    assert_eq!(
        gate.record_check(check)
            .expect_err("empty check name must be rejected"),
        FleetDomainError::EmptyCheckName
    );
}
