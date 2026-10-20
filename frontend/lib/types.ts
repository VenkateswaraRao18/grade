export interface Course {
  id: string;
  name: string;
  instructor_id?: string;
  created_at: string;
  module_count?: number;
  exam_count?: number;
  pending_review_count?: number;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface Assignment {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  instructor_answer: string | null;
  created_at: string;
}

export interface AssignmentWithModule extends Assignment {
  module_title: string;
}

export interface AssignmentDetail extends Assignment {
  module_title: string;
  course_id: string;
  course_name: string;
}

export interface LinkedExam {
  id: string;
  name: string;
  status: string;
}

export interface AssignmentResultRow {
  attempt_id: string;
  student_email: string;
  exam_id: string;
  exam_name: string;
  status: string;
  ended_at: string | null;
  ended_reason: string | null;
  grade_id: string | null;
  grade_status: string | null;
  ai_score: number | null;
  ai_max_score: number | null;
  instructor_score: number | null;
}

export interface AvailableAssignment {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  module_title: string;
  course_name: string;
  submitted: boolean;
  submitted_at: string | null;
}

export interface Submission {
  id: string;
  assignment_id: string;
  original_filename: string;
  content_type: string;
  indexed: boolean;
  submitted_at: string;
}

export interface CourseMaterial {
  id: string;
  module_id: string;
  original_filename: string;
  content_type: string;
  indexed: boolean;
  ingested_at: string;
}

export interface Exam {
  id: string;
  course_id: string;
  name: string;
  duration_minutes: number;
  difficulty: "easy" | "medium" | "hard";
  min_questions: number;
  max_questions: number;
  adaptive_enabled: boolean;
  thinking_time_seconds: number;
  status: "draft" | "published";
  created_at: string;
  assignment_ids: string[];
  rubric: string;
  sample_questions: string | null;
}

export interface AvailableExam {
  id: string;
  name: string;
  course_name: string;
  duration_minutes: number;
  difficulty: string;
  thinking_time_seconds: number;
  rubric: string;
  already_completed: boolean;
}

export interface AttemptRow {
  attempt_id: string;
  student_email: string;
  status: string;
  ended_at: string | null;
  ended_reason: string | null;
  grade_status: string | null;
  ai_score: number | null;
  ai_max_score: number | null;
  instructor_score: number | null;
}

export interface PendingReview {
  attempt_id: string;
  student_email: string;
  exam_name: string;
  course_name: string;
  ended_at: string;
  ended_reason: string | null;
  grade_status: string | null;
  ai_score: number | null;
  ai_max_score: number | null;
}

export interface InstructorStats {
  course_count: number;
  exam_count: number;
  completed_attempt_count: number;
  published_grade_count: number;
}

export interface ClaudeUsageByCallType {
  call_type: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
}

export interface ApiUsage {
  claude: {
    model: string;
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_estimated_cost_usd: number;
    has_unpriced_calls: boolean;
    by_call_type: ClaudeUsageByCallType[];
    note: string;
  };
  elevenlabs: {
    characters_used: number;
    characters_limit: number;
    characters_remaining: number | null;
    tier: string | null;
    next_reset_unix: number | null;
  } | null;
  elevenlabs_error: string | null;
}

export interface GradingDetail {
  id: string;
  criterion: string;
  score: number;
  max_score: number;
  evidence_text: string | null;
  reasoning: string | null;
}

export interface Grade {
  id: string;
  attempt_id: string;
  status: string;
  ai_score: number | null;
  ai_max_score: number | null;
  instructor_score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  instructor_feedback: string | null;
  confidence: number | null;
  details: GradingDetail[];
}

export interface TranscriptEntry {
  sequence: number;
  question: string;
  is_followup: boolean;
  is_generalization: boolean;
  is_graded: boolean;
  difficulty: string;
  answer: string | null;
  ai_score: number | null;
  ai_max_score: number | null;
  ai_feedback: string | null;
  ai_criterion: string | null;
  source_excerpt: string | null;
  highlight_terms: string[] | null;
}

export interface GradeReview {
  grade: Grade;
  transcript: TranscriptEntry[];
  student_email: string;
  exam_name: string;
  course_name: string;
}

export interface AttemptContext {
  student_email: string;
  exam_name: string;
  course_name: string;
  status: string;
  has_end_photo: boolean;
}

export interface MyGrade {
  attempt_id: string;
  exam_name: string;
  course_name: string;
  score: number | null;
  max_score: number | null;
  published_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_email: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  timestamp: string;
}

export interface PublishedGrade {
  exam_name: string;
  course_name: string;
  score: number | null;
  max_score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  instructor_feedback: string | null;
  published_at: string;
  details: GradingDetail[];
}
