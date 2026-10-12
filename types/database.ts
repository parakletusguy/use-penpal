export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          created_at: string
          editor_id: string
          entity_id: number | null
          entity_type: string
          event_data: Json
          event_type: string
          id: number
          manuscript_id: number | null
        }
        Insert: {
          created_at?: string
          editor_id: string
          entity_id?: number | null
          entity_type: string
          event_data?: Json
          event_type: string
          id?: number
          manuscript_id?: number | null
        }
        Update: {
          created_at?: string
          editor_id?: string
          entity_id?: number | null
          entity_type?: string
          event_data?: Json
          event_type?: string
          id?: number
          manuscript_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      citation_occurrences: {
        Row: {
          cited_author: string | null
          cited_year: number | null
          citation_text: string
          created_at: string
          editor_id: string
          id: number
          manuscript_id: number
          reconciliation_status: string
          reference_id: number | null
          run_id: number
          source_locator: Json
        }
        Insert: {
          cited_author?: string | null
          cited_year?: number | null
          citation_text: string
          created_at?: string
          editor_id: string
          id?: number
          manuscript_id: number
          reconciliation_status: string
          reference_id?: number | null
          run_id: number
          source_locator?: Json
        }
        Update: {
          cited_author?: string | null
          cited_year?: number | null
          citation_text?: string
          created_at?: string
          editor_id?: string
          id?: number
          manuscript_id?: number
          reconciliation_status?: string
          reference_id?: number | null
          run_id?: number
          source_locator?: Json
        }
        Relationships: [
          {
            foreignKeyName: "citation_occurrences_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
          {
            foreignKeyName: "citation_occurrences_reference_editor_fkey"
            columns: ["reference_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "reference_records"
            referencedColumns: ["id", "editor_id"]
          },
          {
            foreignKeyName: "citation_occurrences_run_editor_fkey"
            columns: ["run_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "citation_verification_runs"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      citation_verification_runs: {
        Row: {
          attention_reference_count: number
          citation_count: number
          completed_at: string | null
          created_at: string
          editor_id: string
          error_summary: string | null
          id: number
          manuscript_id: number
          profile_version: string
          reference_count: number
          run_status: string
          source_checksum: string | null
          updated_at: string
          verified_reference_count: number
        }
        Insert: {
          attention_reference_count?: number
          citation_count?: number
          completed_at?: string | null
          created_at?: string
          editor_id: string
          error_summary?: string | null
          id?: number
          manuscript_id: number
          profile_version?: string
          reference_count?: number
          run_status?: string
          source_checksum?: string | null
          updated_at?: string
          verified_reference_count?: number
        }
        Update: {
          attention_reference_count?: number
          citation_count?: number
          completed_at?: string | null
          created_at?: string
          editor_id?: string
          error_summary?: string | null
          id?: number
          manuscript_id?: number
          profile_version?: string
          reference_count?: number
          run_status?: string
          source_checksum?: string | null
          updated_at?: string
          verified_reference_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "citation_verification_runs_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      document_artifacts: {
        Row: {
          artifact_type: string
          byte_size: number | null
          checksum: string | null
          content_type: string | null
          created_at: string
          created_by: string | null
          display_name: string
          editor_id: string
          external_file_id: string | null
          external_provider: string | null
          external_url: string | null
          externally_delivered_at: string | null
          generated_from_version: number | null
          id: number
          manuscript_id: number
          storage_path: string
        }
        Insert: {
          artifact_type: string
          byte_size?: number | null
          checksum?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          editor_id: string
          external_file_id?: string | null
          external_provider?: string | null
          external_url?: string | null
          externally_delivered_at?: string | null
          generated_from_version?: number | null
          id?: number
          manuscript_id: number
          storage_path: string
        }
        Update: {
          artifact_type?: string
          byte_size?: number | null
          checksum?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          editor_id?: string
          external_file_id?: string | null
          external_provider?: string | null
          external_url?: string | null
          externally_delivered_at?: string | null
          generated_from_version?: number | null
          id?: number
          manuscript_id?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_artifacts_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      edit_suggestions: {
        Row: {
          applied_in_version: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          editor_id: string
          finding_id: number | null
          id: number
          manuscript_id: number
          original_text: string | null
          proposed_text: string | null
          rationale: string
          source_locator: Json
          suggestion_status: string
          suggestion_type: string
          updated_at: string
        }
        Insert: {
          applied_in_version?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          editor_id: string
          finding_id?: number | null
          id?: number
          manuscript_id: number
          original_text?: string | null
          proposed_text?: string | null
          rationale: string
          source_locator?: Json
          suggestion_status?: string
          suggestion_type: string
          updated_at?: string
        }
        Update: {
          applied_in_version?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          editor_id?: string
          finding_id?: number | null
          id?: number
          manuscript_id?: number
          original_text?: string | null
          proposed_text?: string | null
          rationale?: string
          source_locator?: Json
          suggestion_status?: string
          suggestion_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_suggestions_finding_editor_fkey"
            columns: ["finding_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id", "editor_id"]
          },
          {
            foreignKeyName: "edit_suggestions_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      findings: {
        Row: {
          created_at: string
          description: string
          editor_id: string
          evidence_excerpt: string | null
          finding_status: string
          finding_type: string
          id: number
          manuscript_id: number
          recommended_action: string | null
          requires_editor_decision: boolean
          severity: string
          source_locator: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          editor_id: string
          evidence_excerpt?: string | null
          finding_status?: string
          finding_type: string
          id?: number
          manuscript_id: number
          recommended_action?: string | null
          requires_editor_decision?: boolean
          severity: string
          source_locator?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          editor_id?: string
          evidence_excerpt?: string | null
          finding_status?: string
          finding_type?: string
          id?: number
          manuscript_id?: number
          recommended_action?: string | null
          requires_editor_decision?: boolean
          severity?: string
          source_locator?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      import_batches: {
        Row: {
          attention_file_count: number
          completed_at: string | null
          created_at: string
          editor_id: string
          id: number
          import_notes: string | null
          import_status: string
          imported_file_count: number
          source_folder_id: string
          source_folder_name: string
          source_provider: string
          total_files: number
          updated_at: string
          valid_file_count: number
        }
        Insert: {
          attention_file_count?: number
          completed_at?: string | null
          created_at?: string
          editor_id: string
          id?: number
          import_notes?: string | null
          import_status?: string
          imported_file_count?: number
          source_folder_id: string
          source_folder_name: string
          source_provider?: string
          total_files?: number
          updated_at?: string
          valid_file_count?: number
        }
        Update: {
          attention_file_count?: number
          completed_at?: string | null
          created_at?: string
          editor_id?: string
          id?: number
          import_notes?: string | null
          import_status?: string
          imported_file_count?: number
          source_folder_id?: string
          source_folder_name?: string
          source_provider?: string
          total_files?: number
          updated_at?: string
          valid_file_count?: number
        }
        Relationships: []
      }
      manuscripts: {
        Row: {
          analysis_completed_at: string | null
          analysis_started_at: string | null
          batch_id: number
          consent_recorded_at: string | null
          consent_status: string
          consent_verified_by: string | null
          created_at: string
          current_edit_version: number
          editor_id: string
          extracted_text_storage_path: string | null
          id: number
          original_storage_path: string | null
          source_checksum: string | null
          source_file_id: string
          source_file_modified_at: string | null
          source_file_name: string
          source_mime_type: string | null
          title: string | null
          updated_at: string
          workflow_status: string
        }
        Insert: {
          analysis_completed_at?: string | null
          analysis_started_at?: string | null
          batch_id: number
          consent_recorded_at?: string | null
          consent_status?: string
          consent_verified_by?: string | null
          created_at?: string
          current_edit_version?: number
          editor_id: string
          extracted_text_storage_path?: string | null
          id?: number
          original_storage_path?: string | null
          source_checksum?: string | null
          source_file_id: string
          source_file_modified_at?: string | null
          source_file_name: string
          source_mime_type?: string | null
          title?: string | null
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          analysis_completed_at?: string | null
          analysis_started_at?: string | null
          batch_id?: number
          consent_recorded_at?: string | null
          consent_status?: string
          consent_verified_by?: string | null
          created_at?: string
          current_edit_version?: number
          editor_id?: string
          extracted_text_storage_path?: string | null
          id?: number
          original_storage_path?: string | null
          source_checksum?: string | null
          source_file_id?: string
          source_file_modified_at?: string | null
          source_file_name?: string
          source_mime_type?: string | null
          title?: string | null
          updated_at?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuscripts_batch_editor_fkey"
            columns: ["batch_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      review_reports: {
        Row: {
          created_at: string
          editor_id: string
          finalised_at: string | null
          generated_at: string | null
          id: number
          manuscript_id: number
          model_provider: string | null
          report_content: Json
          report_status: string
          rubric_version: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          editor_id: string
          finalised_at?: string | null
          generated_at?: string | null
          id?: number
          manuscript_id: number
          model_provider?: string | null
          report_content?: Json
          report_status?: string
          rubric_version: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          editor_id?: string
          finalised_at?: string | null
          generated_at?: string | null
          id?: number
          manuscript_id?: number
          model_provider?: string | null
          report_content?: Json
          report_status?: string
          rubric_version?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      reference_records: {
        Row: {
          citation_count: number
          created_at: string
          doi: string | null
          editor_id: string
          first_author: string | null
          id: number
          manuscript_id: number
          parsed_metadata: Json
          publication_year: number | null
          raw_reference: string
          reference_order: number
          run_id: number
          source_locator: Json
          title: string | null
          updated_at: string
          verification_reason: string | null
          verification_status: string
        }
        Insert: {
          citation_count?: number
          created_at?: string
          doi?: string | null
          editor_id: string
          first_author?: string | null
          id?: number
          manuscript_id: number
          parsed_metadata?: Json
          publication_year?: number | null
          raw_reference: string
          reference_order: number
          run_id: number
          source_locator?: Json
          title?: string | null
          updated_at?: string
          verification_reason?: string | null
          verification_status?: string
        }
        Update: {
          citation_count?: number
          created_at?: string
          doi?: string | null
          editor_id?: string
          first_author?: string | null
          id?: number
          manuscript_id?: number
          parsed_metadata?: Json
          publication_year?: number | null
          raw_reference?: string
          reference_order?: number
          run_id?: number
          source_locator?: Json
          title?: string | null
          updated_at?: string
          verification_reason?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_records_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
          {
            foreignKeyName: "reference_records_run_editor_fkey"
            columns: ["run_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "citation_verification_runs"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
      reference_verifications: {
        Row: {
          checked_at: string
          confidence: number
          editor_id: string
          id: number
          lookup_type: string
          manuscript_id: number
          matched_fields: Json
          provider: string
          provider_url: string | null
          provider_work_id: string | null
          received_metadata: Json
          reference_id: number
          request_fingerprint: string
          run_id: number
          verification_status: string
        }
        Insert: {
          checked_at?: string
          confidence: number
          editor_id: string
          id?: number
          lookup_type: string
          manuscript_id: number
          matched_fields?: Json
          provider: string
          provider_url?: string | null
          provider_work_id?: string | null
          received_metadata?: Json
          reference_id: number
          request_fingerprint: string
          run_id: number
          verification_status: string
        }
        Update: {
          checked_at?: string
          confidence?: number
          editor_id?: string
          id?: number
          lookup_type?: string
          manuscript_id?: number
          matched_fields?: Json
          provider?: string
          provider_url?: string | null
          provider_work_id?: string | null
          received_metadata?: Json
          reference_id?: number
          request_fingerprint?: string
          run_id?: number
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_verifications_manuscript_editor_fkey"
            columns: ["manuscript_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id", "editor_id"]
          },
          {
            foreignKeyName: "reference_verifications_reference_editor_fkey"
            columns: ["reference_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "reference_records"
            referencedColumns: ["id", "editor_id"]
          },
          {
            foreignKeyName: "reference_verifications_run_editor_fkey"
            columns: ["run_id", "editor_id"]
            isOneToOne: false
            referencedRelation: "citation_verification_runs"
            referencedColumns: ["id", "editor_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
