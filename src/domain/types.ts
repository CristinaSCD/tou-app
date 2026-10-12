export type Office = 'Bristol' | 'Leeds' | 'Glasgow';

export type Stage = 'submitted' | 'under_review' | 'piloting' | 'implemented' | 'declined';

export type CriterionKey = 'impact' | 'cost' | 'feasibility';

export interface Colleague {
  id: string;
  name: string;
  office: Office;
  jobTitle: string;
  isReviewer: boolean;
  isAdmin: boolean;
}

export interface Category {
  id: string;
  name: string;
  active: boolean;
}

export interface Vote {
  colleagueId: string;
  at: string;
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  at: string;
  editedAt?: string;
  /** The text has been cleared and the comment shows as "Removed by Admin". */
  removedByAdmin?: boolean;
}

export interface Score {
  reviewerId: string;
  impact: number;
  cost: number;
  feasibility: number;
  note: string;
  at: string;
}

/** A panel decision. `from === to` records that the idea was kept in its stage. */
export interface Decision {
  id: string;
  from: Stage;
  to: Stage;
  reason: string;
  recordedById: string;
  at: string;
  /** Set when the entry records a change of pilot owner rather than a panel decision on the stage. */
  kind?: 'reassignment';
}

export interface PilotResult {
  impact: number;
  cost: number;
  feasibility: number;
  summary: string;
  submittedById: string;
  at: string;
}

export interface IdeaContent {
  title: string;
  problem: string;
  solution: string;
  categoryId: string;
  expectedImpact: string;
}

export interface PreviousVersion {
  content: IdeaContent;
  scores: Score[];
  declineReason: string;
  declinedAt: string;
}

export interface Idea extends IdeaContent {
  id: string;
  confidential: boolean;
  submitterId: string;
  office: Office;
  stage: Stage;
  createdAt: string;
  stageEnteredAt: string;
  votes: Vote[];
  comments: Comment[];
  scores: Score[];
  decisions: Decision[];
  pilotOwnerId?: string;
  pilotResult?: PilotResult;
  resubmissions: number;
  previousVersions: PreviousVersion[];
}

export interface Notification {
  id: string;
  toId: string;
  ideaId: string;
  text: string;
  at: string;
  read: boolean;
}

export interface AppState {
  colleagues: Colleague[];
  categories: Category[];
  ideas: Idea[];
  notifications: Notification[];
}
