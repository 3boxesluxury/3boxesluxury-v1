import { NextRequest, NextResponse } from 'next/server';
import {
  createShopifyCart,
  addToShopifyCart,
  removeFromShopifyCart,
  updateShopifyCartLines,
  getShopifyCart,
} from '@/lib/shopify/client';

/**
 * GET /api/shopify/cart?cartId=xxx
 * Get cart details
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cartId = searchParams.get('cartId');

    if (!cartId) {
      return NextResponse.json(
        { error: 'cartId is required' },
        { status: 400 }
      );
    }

    const cart = await getShopifyCart(cartId);

    if (!cart) {
      return NextResponse.json(
        { error: 'Cart not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ cart, source: 'shopify' });
  } catch (error: any) {
    console.error('Shopify cart GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cart', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shopify/cart
 * Create a new cart or add items to existing cart
 * Body: { action: 'create' | 'add' | 'remove' | 'update', cartId?, lines?, lineIds? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, cartId, lines, lineIds } = body;

    switch (action) {
      case 'create': {
        const cart = await createShopifyCart(lines);
        return NextResponse.json({ cart, source: 'shopify' });
      }

      case 'add': {
        if (!cartId || !lines) {
          return NextResponse.json(
            { error: 'cartId and lines are required for add action' },
            { status: 400 }
          );
        }
        const cart = await addToShopifyCart(cartId, lines);
        return NextResponse.json({ cart, source: 'shopify' });
      }

      case 'remove': {
        if (!cartId || !lineIds) {
          return NextResponse.json(
            { error: 'cartId and lineIds are required for remove action' },
            { status: 400 }
          );
        }
        const cart = await removeFromShopifyCart(cartId, lineIds);
        return NextResponse.json({ cart, source: 'shopify' });
      }

      case 'update': {
        if (!cartId || !lines) {
          return NextResponse.json(
            { error: 'cartId and lines are required for update action' },
            { status: 400 }
          );
        }
        const cart = await updateShopifyCartLines(cartId, lines);
        return NextResponse.json({ cart, source: 'shopify' });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create, add, remove, update' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Shopify cart POST error:', error);
    return NextResponse.json(
      { error: 'Failed to modify cart', details: error.message },
      { status: 500 }
    );
  }
}
