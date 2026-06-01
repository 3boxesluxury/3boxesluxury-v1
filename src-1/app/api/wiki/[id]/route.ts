import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth-api'

// GET /api/wiki/[id] — return full wiki document content with access check
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const doc = await db.wikiDocument.findUnique({
      where: { id },
      include: {
        docShares: {
          where: { agentId: user.id },
          select: { canDownload: true, canShare: true },
        },
      },
    })

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Unpublished docs only visible to admin
    if (!doc.isPublished && user.role !== 'admin') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Access check
    const accessRoles = doc.accessRoles.split(',').map((r) => r.trim())

    if (user.role === 'admin' || user.role === 'team') {
      // Admin/team can access all
    } else if (user.role === 'agent') {
      const hasRoleAccess = accessRoles.includes('agent')
      const hasShareAccess = doc.docShares.length > 0
      if (!hasRoleAccess && !hasShareAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      const hasAccess = accessRoles.includes('user')
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Return full document content
    const { docShares, ...docData } = doc
    return NextResponse.json({
      document: {
        ...docData,
        canDownload: user.role === 'admin' || user.role === 'team' || docShares.some((s) => s.canDownload),
        canShare: user.role === 'admin' || user.role === 'team' || docShares.some((s) => s.canShare),
      },
    })
  } catch (error) {
    console.error('Wiki [id] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch wiki document' }, { status: 500 })
  }
}

// PATCH /api/wiki/[id] — admin: update wiki document (publish/unpublish, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    const doc = await db.wikiDocument.findUnique({ where: { id } })
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const updateData: any = {}
    if (body.isPublished !== undefined) updateData.isPublished = body.isPublished
    if (body.title !== undefined) updateData.title = body.title
    if (body.category !== undefined) updateData.category = body.category
    if (body.version !== undefined) updateData.version = body.version
    if (body.content !== undefined) updateData.content = body.content
    if (body.accessRoles !== undefined) updateData.accessRoles = body.accessRoles

    const updated = await db.wikiDocument.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ document: updated })
  } catch (error) {
    console.error('Wiki [id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update wiki document' }, { status: 500 })
  }
}
