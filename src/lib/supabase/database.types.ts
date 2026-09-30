
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_usage": {
                  Row: {
                    "created_at": string,"id": number,"input_tokens": number,"kind": string,"model_id": string,"output_tokens": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"input_tokens"?: number,"kind": string,"model_id"?: string,"output_tokens"?: number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"input_tokens"?: number,"kind"?: string,"model_id"?: string,"output_tokens"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"analyses": {
                  Row: {
                    "coach_notes": string,"created_at": string,"deleted_at": string | null,"drill_videos": NonNullable<Json>,"error": string | null,"id": string,"model": string,"model_id": string,"owner_id": string,"result": Json | null,"server_updated_at": string,"snapshot_ids": (string)[],"status": string,"transcript": string
                  }
                  Insert: {
                    "coach_notes"?: string,"created_at"?: string,"deleted_at"?: string | null,"drill_videos"?: NonNullable<Json>,"error"?: string | null,"id": string,"model": string,"model_id"?: string,"owner_id"?: string,"result"?: Json | null,"server_updated_at"?: string,"snapshot_ids"?: (string)[],"status"?: string,"transcript"?: string
                  }
                  Update: {
                    "coach_notes"?: string,"created_at"?: string,"deleted_at"?: string | null,"drill_videos"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"model"?: string,"model_id"?: string,"owner_id"?: string,"result"?: Json | null,"server_updated_at"?: string,"snapshot_ids"?: (string)[],"status"?: string,"transcript"?: string
                  }
                  Relationships: [
                    
                  ]
                },"clips": {
                  Row: {
                    "camera_view": string,"created_at": string,"crop": NonNullable<Json>,"deleted_at": string | null,"duration_sec": number,"fps": number | null,"handedness": string,"height": number,"id": string,"kind": string,"notes": string,"owner_id": string,"processed": boolean,"server_updated_at": string,"slo_mo_factor": number,"storage_path": string | null,"thumb_path": string | null,"title": string,"trim_end": number,"trim_start": number,"updated_at": string,"width": number
                  }
                  Insert: {
                    "camera_view"?: string,"created_at"?: string,"crop"?: NonNullable<Json>,"deleted_at"?: string | null,"duration_sec"?: number,"fps"?: number | null,"handedness"?: string,"height"?: number,"id": string,"kind": string,"notes"?: string,"owner_id"?: string,"processed"?: boolean,"server_updated_at"?: string,"slo_mo_factor"?: number,"storage_path"?: string | null,"thumb_path"?: string | null,"title"?: string,"trim_end"?: number,"trim_start"?: number,"updated_at"?: string,"width"?: number
                  }
                  Update: {
                    "camera_view"?: string,"created_at"?: string,"crop"?: NonNullable<Json>,"deleted_at"?: string | null,"duration_sec"?: number,"fps"?: number | null,"handedness"?: string,"height"?: number,"id"?: string,"kind"?: string,"notes"?: string,"owner_id"?: string,"processed"?: boolean,"server_updated_at"?: string,"slo_mo_factor"?: number,"storage_path"?: string | null,"thumb_path"?: string | null,"title"?: string,"trim_end"?: number,"trim_start"?: number,"updated_at"?: string,"width"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"default_handedness": string,"display_name": string,"id": string,"is_admin": boolean
                  }
                  Insert: {
                    "created_at"?: string,"default_handedness"?: string,"display_name"?: string,"id": string,"is_admin"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"default_handedness"?: string,"display_name"?: string,"id"?: string,"is_admin"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"snapshots": {
                  Row: {
                    "bottom_clip_id": string | null,"bottom_flipped": boolean,"bottom_time": number | null,"created_at": string,"deleted_at": string | null,"id": string,"image_type": string,"note": string,"owner_id": string,"server_updated_at": string,"storage_path": string | null,"top_clip_id": string | null,"top_flipped": boolean,"top_time": number | null,"updated_at": string
                  }
                  Insert: {
                    "bottom_clip_id"?: string | null,"bottom_flipped"?: boolean,"bottom_time"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"id": string,"image_type"?: string,"note"?: string,"owner_id"?: string,"server_updated_at"?: string,"storage_path"?: string | null,"top_clip_id"?: string | null,"top_flipped"?: boolean,"top_time"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "bottom_clip_id"?: string | null,"bottom_flipped"?: boolean,"bottom_time"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"image_type"?: string,"note"?: string,"owner_id"?: string,"server_updated_at"?: string,"storage_path"?: string | null,"top_clip_id"?: string | null,"top_flipped"?: boolean,"top_time"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"object_owner":
{ Args: { "object_name": string }; Returns: string
                           },
"shares_household":
{ Args: { "owner": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

