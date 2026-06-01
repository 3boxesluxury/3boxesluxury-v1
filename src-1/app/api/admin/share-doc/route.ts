import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth-api'

// GET /api/admin/share-doc — list all document shares (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const shares = await db.agentDocShare.findMany({
      include: {
        document: { select: { id: true, title: true, slug: true } },
        agent: { select: { id: true, name: true, email: true } },
        admin: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ shares })
  } catch (error) {
    console.error('Admin share-doc GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch shares' }, { status: 500 })
  }
}

// POST /api/admin/share-doc — admin shares a wiki document with an agent
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { docId, agentId, canDownload, canShare, message } = body

    if (!docId || !agentId) {
      return NextResponse.json(
        { error: 'docId and agentId are required' },
        { status: 400 }
      )
    }

    // Verify document exists
    const doc = await db.wikiDocument.findUnique({ where: { id: docId } })
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify agent exists and has agent role
    const agent = await db.user.findUnique({ where: { id: agentId } })
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    if (agent.role !== 'agent') {
      return NextResponse.json({ error: 'Target user is not an agent' }, { status: 400 })
    }

    // Create or update the share record (unique constraint on [docId, agentId])
    try {
      const share = await db.agentDocShare.create({
        data: {
          docId,
          agentId,
          adminId: user.id,
          canDownload: canDownload !== undefined ? canDownload : true,
          canShare: canShare !== undefined ? canShare : false,
          message: message || null,
        },
        include: {
          document: { select: { id: true, title: true, slug: true } },
          agent: { select: { id: true, name: true, email: true } },
          admin: { select: { id: true, name: true } },
        },
      })

      return NextResponse.json({ share }, { status: 201 })
    } catch (err: unknown) {
      // Handle unique constraint — share already exists
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        return NextResponse.json(
          { error: 'Document already shared with this agent' },
          { status: 409 }
        )
      }
      throw err
    }
  } catch (error) {
    console.error('Admin share-doc POST error:', error)
    return NextResponse.json({ error: 'Failed to share document' }, { status: 500 })
  }
}
