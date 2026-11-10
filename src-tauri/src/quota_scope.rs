//! Process-local account epochs. No credentials or identity keys cross IPC.
use std::sync::Mutex;

#[derive(Default)]
pub(crate) struct Scope {
    identity: Option<String>,
    revision: u64,
    initialized: bool,
}
impl Scope {
    fn reconcile(&mut self, identity: Option<String>) -> bool {
        if self.initialized && self.identity == identity {
            return false;
        }
        self.identity = identity;
        self.initialized = true;
        self.revision = self.revision.saturating_add(1);
        true
    }
}
static SCOPE: Mutex<Scope> = Mutex::new(Scope {
    identity: None,
    revision: 0,
    initialized: false,
});

pub(crate) fn reconcile_with<T>(identity: Option<String>, apply: impl FnOnce(u64) -> T) -> T {
    let mut scope = SCOPE.lock().unwrap_or_else(|error| error.into_inner());
    let changed = scope.reconcile(identity);
    // Process-local initialization is not proof of a persisted account change.
    // Let the stable identity reconcile its store first; only then invalidate
    // transient presentation state and publish the new epoch under this lock.
    let result = apply(scope.revision);
    if changed {
        crate::codex_limits::invalidate_scope(scope.revision);
    }
    result
}

pub(crate) fn with_current<T>(revision: u64, apply: impl FnOnce() -> T) -> Option<T> {
    let scope = SCOPE.lock().unwrap_or_else(|error| error.into_inner());
    (scope.revision == revision).then(apply)
}

pub(crate) fn with_live<T>(apply: impl FnOnce(u64) -> T) -> T {
    let scope = SCOPE.lock().unwrap_or_else(|error| error.into_inner());
    apply(scope.revision)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn account_workspace_source_changes_and_switching_back_never_reuse_old_epochs() {
        let mut scope = Scope::default();
        assert!(scope.reconcile(Some("synthetic-user-a/workspace-a/source-a".into())));
        let first = scope.revision;
        assert!(!scope.reconcile(Some("synthetic-user-a/workspace-a/source-a".into())));
        for next in [
            "synthetic-user-b/workspace-a/source-a",
            "synthetic-user-b/workspace-b/source-a",
            "synthetic-user-b/workspace-b/source-b",
            "synthetic-user-a/workspace-a/source-a",
        ] {
            assert!(scope.reconcile(Some(next.into())));
            assert!(scope.revision > first);
        }
        assert!(scope.reconcile(None));
        assert!(!scope.reconcile(None));
    }

    #[test]
    fn reconcile_and_store_write_are_one_epoch_transaction_under_concurrency() {
        use std::{
            sync::{mpsc, Arc, Mutex},
            thread,
            time::Duration,
        };
        let stored = Arc::new(Mutex::new(0));
        let (entered, wait_entered) = mpsc::channel();
        let (release, wait_release) = mpsc::channel();
        let first_store = stored.clone();
        let first = thread::spawn(move || {
            reconcile_with(Some("synthetic-concurrent-a".into()), |revision| {
                entered.send(()).unwrap();
                wait_release.recv().unwrap();
                *first_store.lock().unwrap() = revision;
            })
        });
        wait_entered.recv_timeout(Duration::from_secs(2)).unwrap();
        let (second_done, wait_second) = mpsc::channel();
        let second_store = stored.clone();
        let second = thread::spawn(move || {
            reconcile_with(Some("synthetic-concurrent-b".into()), |revision| {
                *second_store.lock().unwrap() = revision;
                second_done.send(revision).unwrap();
            })
        });
        assert!(wait_second.recv_timeout(Duration::from_millis(30)).is_err());
        release.send(()).unwrap();
        first.join().unwrap();
        second.join().unwrap();
        let last = wait_second.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(*stored.lock().unwrap(), last);
        assert!(with_current(last.saturating_sub(1), || panic!(
            "Late observation cannot cross epochs"
        ))
        .is_none());
    }
}
