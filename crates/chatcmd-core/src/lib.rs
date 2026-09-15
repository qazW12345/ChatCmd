//! Domain contracts for the direct, local-only ChatCMD runtime.

#![allow(async_fn_in_trait)]
#![forbid(unsafe_code)]

mod fleet;
mod models;
mod secret;
mod stores;

pub use fleet::*;
pub use models::*;
pub use secret::*;
pub use stores::*;
