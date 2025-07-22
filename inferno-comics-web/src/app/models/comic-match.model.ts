export interface ComicMatch {
    session_id?: string;
    url: string;
    local_url?: string; // Make optional to accommodate both components
    similarity: number;
    status?: string;
    match_details: {
      orb: { good_matches: number; similarity: number; total_matches: number };
      sift: { good_matches: number; similarity: number; total_matches: number };
      akaze: { good_matches: number; similarity: number; total_matches: number };
      kaze: { good_matches: number; similarity: number; total_matches: number };
    };
    candidate_features?: { 
      orb_count?: number; 
      sift_count?: number;
      akaze_count?: number;
      kaze_count?: number;
    };
    comic_name: string;
    issue_number: string;
    comic_vine_id?: number | null;
    cover_error?: string;
    issue?: any | null; // Use any or create proper Issue interface
    parent_comic_vine_id?: number | null;
    sourceImageIndex?: number;
    sourceImageName?: string;
    meets_threshold?: boolean;
  }
  