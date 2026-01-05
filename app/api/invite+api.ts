import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client with service role
const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Regular client for verifying user tokens
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing authorization' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify the user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile to verify admin status
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.role !== 'admin') {
      return Response.json({ error: 'Only admins can invite users' }, { status: 403 })
    }

    // Parse request body
    const { emails } = await request.json()

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return Response.json({ error: 'Please provide at least one email' }, { status: 400 })
    }

    if (emails.length > 10) {
      return Response.json({ error: 'Maximum 10 invites at a time' }, { status: 400 })
    }

    // Send invites
    const results = []
    for (const email of emails) {
      const trimmedEmail = email.trim().toLowerCase()

      if (!trimmedEmail || !trimmedEmail.includes('@')) {
        results.push({ email: trimmedEmail || email, success: false, error: 'Invalid email' })
        continue
      }

      try {
        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          trimmedEmail,
          {
            data: {
              organization_id: profile.organization_id,
              invited_by: user.id,
              invited_role: 'user',
            },
            redirectTo: 'https://outstocked.vercel.app/set-password',
          }
        )

        if (inviteError) {
          results.push({ email: trimmedEmail, success: false, error: inviteError.message })
        } else {
          results.push({ email: trimmedEmail, success: true })
        }
      } catch (e) {
        results.push({ email: trimmedEmail, success: false, error: 'Failed to send' })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return Response.json({
      message: `Sent ${successful} invite(s)${failed > 0 ? `, ${failed} failed` : ''}`,
      results,
    })
  } catch (error) {
    console.error('Invite error:', error)
    return Response.json(
      { error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    )
  }
}
