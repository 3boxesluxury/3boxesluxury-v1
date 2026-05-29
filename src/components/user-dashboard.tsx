'use client'

import React from 'react'
import { useStore } from '@/lib/store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  User, ShoppingBag, Heart, CreditCard, Ticket, ArrowLeft, Mail, Shield, Loader2, Package, Clock, Truck, XCircle, ShoppingCart, MessageSquare, Plus,
} from 'lucide-react'

/* ─── style constants ─── */
const cardCls = 'border-amber-900/30 bg-stone-900/80'
const btnPrimary = 'bg-amber-600 text-stone-950 hover:bg-amber-500'
const btnOutline = 'border-amber-900/40 text-amber-200/60 hover:bg-amber-900/20 hover:text-amber-400'

const authH = (t: string | null): Record<string, string> => t ? { Authorization: `Bearer ${t}` } : {}

const statusColor = (s: string) => {
  const m: Record<string, string> = {
    pending: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    processing: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    shipped: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
    delivered: 'bg-green-600/20 text-green-400 border-green-600/30',
    cancelled: 'bg-red-600/20 text-red-400 border-red-600/30',
    open: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    in_progress: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    resolved: 'bg-green-600/20 text-green-400 border-green-600/30',
    closed: 'bg-stone-600/20 text-stone-400 border-stone-600/30',
  }
  return m[s] || 'bg-stone-600/20 text-stone-400 border-stone-600/30'
}

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/* ─── Main Component ─── */
export function UserDashboard() {
  const { authUser, authToken, setView, clearAuth, setAuthView } = useStore()

  // 401 auto-logout
  React.useEffect(() => {
    const handler = () => { clearAuth(); setAuthView('login') }
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [clearAuth, setAuthView])

  if (!authUser || authUser.role !== 'user') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className={`${cardCls} w-full max-w-md`}>
          <CardContent className="p-8 text-center">
            <Shield className="mx-auto mb-4 h-12 w-12 text-red-400" />
            <h2 className="mb-2 text-xl font-bold text-amber-100">Access Denied</h2>
            <p className="mb-4 text-sm text-amber-200/60">You do not have user privileges to view this page.</p>
            <Button className={btnPrimary} onClick={() => setView('home')}>Back to Store</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600/20">
            <User className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-amber-100">My Account</h1>
            <p className="text-xs text-amber-200/50">Welcome back, {authUser.name}</p>
          </div>
        </div>
        <Button variant="outline" className={btnOutline} onClick={() => setView('home')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Store
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Profile Card */}
        <ProfileCard user={authUser} />

        {/* Recent Orders */}
        <div className="lg:col-span-2">
          <RecentOrders token={authToken} email={authUser.email} />
        </div>
      </div>

      {/* Order Tracking Section */}
      <OrderTrackingSection token={authToken} email={authUser.email} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Wishlist */}
        <WishlistSection token={authToken} />

        {/* Payment Methods */}
        <PaymentMethodsSection />

        {/* Support Tickets */}
        <SupportTicketsSection token={authToken} userId={authUser.id} />
      </div>
    </motion.div>
  )
}

/* ─── Profile Card ─── */
function ProfileCard({ user }: { user: { name: string; email: string; role: string } }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card className={cardCls}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-amber-100">Profile Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-600/20 text-xl font-bold text-amber-400">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold text-amber-100">{user.name}</p>
              <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 capitalize">{user.role}</Badge>
            </div>
          </div>
          <Separator className="bg-amber-900/20" />
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-amber-200/40" />
              <div>
                <p className="text-xs text-amber-200/50">Email</p>
                <p className="text-sm text-amber-100">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-amber-200/40" />
              <div>
                <p className="text-xs text-amber-200/50">Role</p>
                <p className="text-sm text-amber-100 capitalize">{user.role}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Recent Orders ─── */
function RecentOrders({ token, email }: { token: string | null; email: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-orders', email],
    queryFn: async () => {
      const res = await fetch(`/api/orders?email=${encodeURIComponent(email)}`, { headers: authH(token) })
      if (!res.ok) throw new Error('Failed to fetch orders')
      return res.json()
    },
  })

  const orders = data?.orders || []

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <Card className={cardCls}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold text-amber-100">Recent Orders</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="mx-auto mb-2 h-8 w-8 text-amber-200/20" />
              <p className="text-sm text-amber-200/40">No orders yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-amber-900/20 hover:bg-transparent">
                    <TableHead className="text-amber-200/50">Order #</TableHead>
                    <TableHead className="text-amber-200/50">Items</TableHead>
                    <TableHead className="text-amber-200/50">Total</TableHead>
                    <TableHead className="text-amber-200/50">Status</TableHead>
                    <TableHead className="text-amber-200/50">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.slice(0, 10).map((o: any) => (
                    <TableRow key={o.id} className="border-amber-900/10 hover:bg-amber-900/5">
                      <TableCell className="text-sm font-medium text-amber-100">{o.orderNumber}</TableCell>
                      <TableCell className="text-sm text-amber-200/60">{o.itemCount || o.items?.length || 0}</TableCell>
                      <TableCell className="text-sm font-medium text-amber-100">{fmt(o.total)}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(o.status)}>{o.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-amber-200/60">{fmtDate(o.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Order Tracking Section ─── */
function OrderTrackingSection({ token, email }: { token: string | null; email: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-orders-tracking', email],
    queryFn: async () => {
      const res = await fetch(`/api/orders?email=${encodeURIComponent(email)}`, { headers: authH(token) })
      if (!res.ok) throw new Error('Failed to fetch orders')
      return res.json()
    },
  })

  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false)
  const [cancelOrderId, setCancelOrderId] = React.useState<string | null>(null)
  const [cancelReason, setCancelReason] = React.useState('')
  const [cancelLoading, setCancelLoading] = React.useState(false)
  const queryClient = useQueryClient()

  const orders = (data?.orders || []).filter((o: any) => o.trackingNumber || o.estimatedDelivery || o.status === 'pending')

  const handleCancelOrder = async () => {
    if (!cancelOrderId) return
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/orders/${cancelOrderId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authH(token) },
        body: JSON.stringify({ reason: cancelReason, email }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['user-orders-tracking', email] })
        queryClient.invalidateQueries({ queryKey: ['user-orders', email] })
      }
    } catch {
      // ignore
    } finally {
      setCancelLoading(false)
      setCancelDialogOpen(false)
      setCancelReason('')
      setCancelOrderId(null)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
      <Card className={cardCls}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold text-amber-100">Order Tracking</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-6 text-center">
              <Truck className="mx-auto mb-2 h-8 w-8 text-amber-200/20" />
              <p className="text-sm text-amber-200/40">No tracking info available</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {orders.map((o: any) => (
                <div key={o.id} className="rounded-lg border border-amber-900/20 bg-stone-800/30 p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-100">{o.orderNumber}</p>
                      <Badge className={statusColor(o.status)}>{o.status}</Badge>
                      {o.deliveryType && (
                        <Badge className="ml-2 bg-stone-600/20 text-stone-300 border-stone-600/30 capitalize text-[10px]">
                          {o.deliveryType}
                        </Badge>
                      )}
                    </div>
                    {o.status === 'pending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setCancelOrderId(o.id); setCancelDialogOpen(true) }}
                        className="border-red-900/30 text-red-400/60 hover:border-red-600/40 hover:text-red-400 text-xs h-7"
                      >
                        <XCircle className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {o.trackingNumber && (
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-amber-200/30" />
                        <span className="text-xs text-amber-200/50">Tracking:</span>
                        {o.trackingUrl ? (
                          <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline">
                            {o.trackingNumber}
                          </a>
                        ) : (
                          <span className="text-xs text-amber-100">{o.trackingNumber}</span>
                        )}
                      </div>
                    )}
                    {o.estimatedDelivery && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-200/30" />
                        <span className="text-xs text-amber-200/50">Est. Delivery:</span>
                        <span className="text-xs text-amber-100">{fmtDate(o.estimatedDelivery)}</span>
                      </div>
                    )}
                    {o.giftWrapping && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]">🎁</span>
                        <span className="text-xs text-amber-200/40">Gift Wrapped{o.giftWrapStyle ? ` (${o.giftWrapStyle})` : ''}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cancel Order Dialog */}
          <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <DialogContent className="border-amber-900/30 bg-stone-950 sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-amber-100">Cancel Order</DialogTitle>
                <DialogDescription className="text-amber-200/50">Are you sure you want to cancel this order?</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="cancel-reason" className="text-sm text-amber-200/60">Reason for cancellation</Label>
                  <Input
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Tell us why you're cancelling"
                    className="mt-1 border-amber-900/40 bg-stone-800/50 text-amber-50 placeholder:text-amber-200/20"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => { setCancelDialogOpen(false); setCancelReason(''); setCancelOrderId(null) }}
                    className="flex-1 border-amber-900/40 text-amber-200/60"
                  >
                    Keep Order
                  </Button>
                  <Button
                    onClick={handleCancelOrder}
                    disabled={cancelLoading}
                    className="flex-1 bg-red-600 text-white hover:bg-red-500"
                  >
                    {cancelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel Order'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Wishlist Section ─── */
function WishlistSection({ token }: { token: string | null }) {
  const queryClient = useQueryClient()
  const { addItem } = useStore()

  const { data, isLoading } = useQuery({
    queryKey: ['user-wishlist'],
    queryFn: async () => {
      const res = await fetch('/api/wishlist', { headers: authH(token) })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!token,
  })

  const wishlist = data?.wishlist || []

  const handleRemoveFromWishlist = async (productId: string) => {
    try {
      const res = await fetch('/api/wishlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authH(token) },
        body: JSON.stringify({ productId }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['user-wishlist'] })
      }
    } catch {
      // ignore
    }
  }

  const handleAddToCart = (item: any) => {
    const product = item.product
    const images = product?.images ? JSON.parse(typeof product.images === 'string' ? product.images : '[]') : []
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: images[0] || '/images/placeholder.jpg',
    })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <Card className={cardCls}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold text-amber-100">Wishlist</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="py-6 text-center">
              <Heart className="mx-auto mb-2 h-8 w-8 text-amber-200/20" />
              <p className="text-sm text-amber-200/40">Sign in to view your wishlist</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            </div>
          ) : wishlist.length === 0 ? (
            <div className="py-6 text-center">
              <Heart className="mx-auto mb-2 h-8 w-8 text-amber-200/20" />
              <p className="text-sm text-amber-200/40">Your wishlist is empty</p>
              <p className="mt-1 text-xs text-amber-200/30">Save items you love for later</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {wishlist.map((w: any) => {
                const product = w.product
                const images = product?.images ? JSON.parse(typeof product.images === 'string' ? product.images : '[]') : []
                return (
                  <div key={w.id} className="flex items-center gap-3 rounded-lg border border-amber-900/20 bg-stone-800/30 p-3">
                    {images[0] ? (
                      <img src={images[0]} alt={product.name} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-stone-700/50">
                        <Package className="h-4 w-4 text-amber-200/30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-amber-100">{product.name}</p>
                      <p className="text-xs text-amber-200/50">{fmt(product.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddToCart(w)}
                        className="h-8 w-8 p-0 text-amber-200/40 hover:text-amber-400"
                        title="Add to Cart"
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFromWishlist(w.productId)}
                        className="h-8 w-8 p-0 text-red-400/40 hover:text-red-400"
                        title="Remove from Wishlist"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Payment Methods ─── */
function PaymentMethodsSection() {
  const cards = [
    { type: 'Visa', last4: '4242', expiry: '12/26', brand: 'visa' },
    { type: 'Mastercard', last4: '8888', expiry: '06/25', brand: 'mastercard' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <Card className={cardCls}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold text-amber-100">Payment Methods</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {cards.map((c, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-amber-900/20 bg-stone-800/30 p-3">
                <CreditCard className="h-8 w-8 text-amber-200/40" />
                <div className="flex-1">
                  <p className="text-sm text-amber-100">{c.type} •••• {c.last4}</p>
                  <p className="text-xs text-amber-200/50">Expires {c.expiry}</p>
                </div>
                <Badge className="bg-green-600/20 text-green-400 border-green-600/30">Default</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Support Tickets ─── */
function SupportTicketsSection({ token, userId }: { token: string | null; userId: string }) {
  const queryClient = useQueryClient()
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [viewTicketDialogOpen, setViewTicketDialogOpen] = React.useState(false)
  const [selectedTicket, setSelectedTicket] = React.useState<any>(null)
  const [ticketForm, setTicketForm] = React.useState({ subject: '', priority: 'medium', message: '' })
  const [ticketSubmitting, setTicketSubmitting] = React.useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['user-tickets', userId],
    queryFn: async () => {
      const res = await fetch(`/api/support/tickets?userId=${userId}`, { headers: authH(token) })
      if (!res.ok) throw new Error('Failed to fetch tickets')
      return res.json()
    },
    enabled: !!token && !!userId,
  })

  const tickets = data?.tickets || []

  const handleCreateTicket = async () => {
    if (!ticketForm.subject) return
    setTicketSubmitting(true)
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH(token) },
        body: JSON.stringify({
          subject: ticketForm.subject,
          priority: ticketForm.priority,
          userId,
          message: ticketForm.message || `Ticket created: ${ticketForm.subject}`,
        }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['user-tickets', userId] })
        setCreateDialogOpen(false)
        setTicketForm({ subject: '', priority: 'medium', message: '' })
      }
    } catch {
      // ignore
    } finally {
      setTicketSubmitting(false)
    }
  }

  const handleViewTicket = (ticket: any) => {
    setSelectedTicket(ticket)
    setViewTicketDialogOpen(true)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
      <Card className={cardCls}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-sm font-semibold text-amber-100">Support Tickets</CardTitle>
            </div>
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className={`${btnPrimary} h-7 text-xs`}
            >
              <Plus className="mr-1 h-3 w-3" />
              New Ticket
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="py-6 text-center">
              <Ticket className="mx-auto mb-2 h-8 w-8 text-amber-200/20" />
              <p className="text-sm text-amber-200/40">Sign in to view tickets</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-6 text-center">
              <Clock className="mx-auto mb-2 h-8 w-8 text-amber-200/20" />
              <p className="text-sm text-amber-200/40">No support tickets</p>
              <p className="mt-1 text-xs text-amber-200/30">Your support requests will appear here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tickets.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => handleViewTicket(t)}
                  className="flex w-full items-center justify-between rounded-lg border border-amber-900/20 bg-stone-800/30 p-3 text-left hover:bg-stone-800/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-amber-100 truncate">{t.subject}</p>
                    <p className="text-xs text-amber-200/50">{fmtDate(t.createdAt)}</p>
                  </div>
                  <Badge className={statusColor(t.status)}>{t.status}</Badge>
                </button>
              ))}
            </div>
          )}

          {/* Create Ticket Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent className="border-amber-900/30 bg-stone-950 sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-amber-100">Create Support Ticket</DialogTitle>
                <DialogDescription className="text-amber-200/50">Describe your issue and we'll help you out</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="ticket-subject" className="text-sm text-amber-200/60">Subject</Label>
                  <Input
                    id="ticket-subject"
                    value={ticketForm.subject}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Brief description of your issue"
                    className="mt-1 border-amber-900/40 bg-stone-800/50 text-amber-50 placeholder:text-amber-200/20"
                  />
                </div>
                <div>
                  <Label htmlFor="ticket-priority" className="text-sm text-amber-200/60">Priority</Label>
                  <Select value={ticketForm.priority} onValueChange={(v) => setTicketForm(prev => ({ ...prev, priority: v }))}>
                    <SelectTrigger className="mt-1 border-amber-900/40 bg-stone-800/50 text-amber-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-amber-900/30 bg-stone-900">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ticket-message" className="text-sm text-amber-200/60">Message</Label>
                  <textarea
                    id="ticket-message"
                    value={ticketForm.message}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Describe your issue in detail"
                    rows={4}
                    className="mt-1 w-full rounded-md border border-amber-900/40 bg-stone-800/50 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-200/20 focus:outline-none focus:ring-1 focus:ring-amber-600 resize-none"
                  />
                </div>
                <Button
                  onClick={handleCreateTicket}
                  disabled={ticketSubmitting || !ticketForm.subject}
                  className="w-full bg-amber-600 text-stone-950 hover:bg-amber-500"
                >
                  {ticketSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Submit Ticket
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* View Ticket Dialog */}
          <Dialog open={viewTicketDialogOpen} onOpenChange={setViewTicketDialogOpen}>
            <DialogContent className="border-amber-900/30 bg-stone-950 sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-amber-100">{selectedTicket?.subject}</DialogTitle>
                <DialogDescription className="text-amber-200/50">
                  <Badge className={statusColor(selectedTicket?.status)}>{selectedTicket?.status}</Badge>
                  <span className="ml-2">{selectedTicket?.priority && `Priority: ${selectedTicket.priority}`}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2 max-h-64 overflow-y-auto">
                {selectedTicket?.messages?.map((msg: any) => (
                  <div key={msg.id} className={`rounded-lg border border-amber-900/15 bg-stone-800/30 p-3 ${msg.senderId === userId ? 'ml-4' : 'mr-4'}`}>
                    <p className="text-xs text-amber-200/30 mb-1">
                      {msg.senderId === userId ? 'You' : 'Support'} · {fmtDate(msg.createdAt)}
                    </p>
                    <p className="text-sm text-amber-200/70">{msg.message}</p>
                  </div>
                ))}
                {(!selectedTicket?.messages || selectedTicket.messages.length === 0) && (
                  <p className="text-sm text-amber-200/40 text-center py-4">No messages yet</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </motion.div>
  )
}
