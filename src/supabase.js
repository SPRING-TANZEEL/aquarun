import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://euffyxegiqraqvzacefq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1ZmZ5eGVnaXFyYXF2emFjZWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Njk0NzYsImV4cCI6MjA5ODA0NTQ3Nn0.qnf1oloScxEbZk7bZL2QlwUbDYlF5ZhJBuma4ldb8WQ'

export const supabase = createClient(supabaseUrl, supabaseKey)