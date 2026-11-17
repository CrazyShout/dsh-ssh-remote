/** Browser-safe branch results returned by the SSH remote branch control. */
export interface RemoteBranch {
  /** Full remote-tracking ref such as `refs/remotes/origin/main`. */
  ref: string;
  /** Remote name from the checkout. */
  remote: string;
  /** Branch name below the remote-tracking namespace. */
  branch: string;
  /** Display name such as `origin/main`. */
  name: string;
}

/** Branch facts for one checkout. */
export interface BranchListing {
  /** Checked-out local branch, or null while HEAD is detached. */
  current: string | null;
  /** Abbreviated HEAD commit, or null for an unborn checkout. */
  commit: string | null;
  /** Matching local branch names, with the current branch first. */
  local: string[];
  /** Matching remote-tracking branches whose local names do not already exist. */
  remote: RemoteBranch[];
  /** Remote branches fetched by this search. */
  fetched: string[];
  /** A non-fatal remote lookup or fetch diagnostic. */
  warning: string;
}

/** Checkout identity after a successful branch mutation. */
export interface BranchMutation {
  current: string | null;
  commit: string | null;
  message: string;
}
