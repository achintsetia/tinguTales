// Shared application types

export interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
  role?: "user" | "agency";
  is_admin?: boolean;
  isActive?: boolean;
  session_token?: string;
  credits?: number;
}

export interface StoryPage {
  page_number: number;
  text: string;
  image_url?: string;
  jpeg_url?: string;
}

export interface Story {
  story_id: string;
  title?: string;
  status: string;
  page_count: number;
  pages?: StoryPage[];
  language?: string;
  child_name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Payment {
  payment_id: string;
  order_id?: string;
  status: "created" | "paid" | "failed" | "refunded";
  amount: number;
  page_count: number;
  story_id?: string;
  created_at?: string;
}

export interface Job {
  status: "pending" | "processing" | "done" | "failed";
  job_type: string;
  payload?: { story_id?: string };
  created_at?: string;
}

export interface AdminStats {
  total_users: number;
  total_stories: number;
  completed_stories: number;
  total_revenue: number;
  pending_jobs: number;
  processing_jobs: number;
}
