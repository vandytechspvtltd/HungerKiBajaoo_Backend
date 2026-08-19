import dotenv from 'dotenv';
dotenv.config();

const base = 'http://localhost:3000';
const PHONE = '+15550001111';
const TOKEN = 'dev-46e0f1df727cdb341e7fcb4552cb5a21661fffeecceb6a00';

async function req(method, url, headers = {}, body = undefined) {
  const options = { method, headers };
  if (body !== undefined) options.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await fetch(url, options);
  const text = await res.text();
  const parsed = (() => { try { return text ? JSON.parse(text) : null; } catch { return text; } })();
  return { status: res.status, body: parsed, raw: text };
}

(async () => {
  const authHeaders = { accept: 'application/json', 'Content-Type': 'application/json' };
  const sendOtp = await req('POST', `${base}/api/auth/send-otp`, authHeaders, { phone: PHONE });
  console.log('SEND_OTP', sendOtp.status, JSON.stringify(sendOtp.body));

  const verifyOtp = await req('POST', `${base}/api/auth/verify-otp`, authHeaders, { phone: PHONE, token: '123456' });
  console.log('VERIFY_OTP', verifyOtp.status, JSON.stringify(verifyOtp.body));
  const token = verifyOtp.body?.access_token || TOKEN;
  const bearer = { accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const checks = [
    ['GET /api/health', () => req('GET', `${base}/api/health`, { accept: 'application/json' })],
    ['GET /api/restaurants', () => req('GET', `${base}/api/restaurants`, bearer)],
    ['GET /api/categories', () => req('GET', `${base}/api/categories`, bearer)],
    ['GET /api/offers', () => req('GET', `${base}/api/offers`, bearer)],
    ['GET /api/restaurants/1', () => req('GET', `${base}/api/restaurants/1`, bearer)],
    ['GET /api/restaurants/1/menu', () => req('GET', `${base}/api/restaurants/1/menu`, bearer)],
    ['GET /api/favorites', () => req('GET', `${base}/api/favorites`, bearer)],
    ['POST /api/favorites/1', () => req('POST', `${base}/api/favorites/1`, bearer)],
    ['GET /api/favorites after add', () => req('GET', `${base}/api/favorites`, bearer)],
    ['GET /api/addresses', () => req('GET', `${base}/api/addresses`, bearer)],
    ['POST /api/addresses', () => req('POST', `${base}/api/addresses`, bearer, { title: 'Home', address: 'Test address', latitude: 22.7196, longitude: 75.8577, is_default: true })],
    ['GET /api/cart', () => req('GET', `${base}/api/cart`, bearer)],
    ['POST /api/cart/items', () => req('POST', `${base}/api/cart/items`, bearer, { food_id: 1, quantity: 1 })],
    ['GET /api/cart after add', () => req('GET', `${base}/api/cart`, bearer)],
    ['POST /api/coupons/validate', () => req('POST', `${base}/api/coupons/validate`, bearer, { code: 'WELCOME50', cart_total: 199 })],
    ['GET /api/coupons', () => req('GET', `${base}/api/coupons`, bearer)],
  ];

  for (const [label, fn] of checks) {
    const result = await fn();
    console.log(label, result.status, JSON.stringify(result.body));
  }

  const cartGet = await req('GET', `${base}/api/cart`, bearer);
  const cartId = cartGet.body?.data?.[0]?.id;
  if (cartId) {
    const patchCart = await req('PATCH', `${base}/api/cart/items/${cartId}`, bearer, { quantity: 2 });
    console.log('PATCH /api/cart/items/:id', patchCart.status, JSON.stringify(patchCart.body));
  }
  const cartAfterPatch = await req('GET', `${base}/api/cart`, bearer);
  console.log('GET /api/cart after patch', cartAfterPatch.status, JSON.stringify(cartAfterPatch.body));

  const addrList = await req('GET', `${base}/api/addresses`, bearer);
  const addressId = addrList.body?.data?.[0]?.id || 2;

  const orderPayload = { restaurant_id: 1, address_id: addressId, payment_method: 'cod', coupon_code: 'WELCOME50' };
  const orderCreate = await req('POST', `${base}/api/orders`, bearer, orderPayload);
  console.log('POST /api/orders', orderCreate.status, JSON.stringify(orderCreate.body));

  const ordersList = await req('GET', `${base}/api/orders`, bearer);
  console.log('GET /api/orders', ordersList.status, JSON.stringify(ordersList.body));

  const orderId = ordersList.body?.data?.[0]?.id;
  if (orderId) {
    const orderDetail = await req('GET', `${base}/api/orders/${orderId}`, bearer);
    console.log('GET /api/orders/:id', orderDetail.status, JSON.stringify(orderDetail.body));
    const cancel = await req('POST', `${base}/api/orders/${orderId}/cancel`, bearer);
    console.log('POST /api/orders/:id/cancel', cancel.status, JSON.stringify(cancel.body));
  }

  if (addressId) {
    const deleteAddress = await req('DELETE', `${base}/api/addresses/${addressId}`, bearer);
    console.log('DELETE /api/addresses/:id', deleteAddress.status, JSON.stringify(deleteAddress.body));
  }

  const cartClear = await req('DELETE', `${base}/api/cart`, bearer);
  console.log('DELETE /api/cart', cartClear.status, JSON.stringify(cartClear.body));

  const removeFavorite = await req('DELETE', `${base}/api/favorites/1`, bearer);
  console.log('DELETE /api/favorites/:restaurantId', removeFavorite.status, JSON.stringify(removeFavorite.body));
})();
