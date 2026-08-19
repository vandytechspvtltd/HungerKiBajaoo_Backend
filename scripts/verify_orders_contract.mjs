import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id').limit(1);
  if (profilesError) throw profilesError;
  if (!profiles || profiles.length === 0) throw new Error('No profiles found; cannot test order insert');

  const userId = profiles[0].id;
  const { data: addresses } = await supabase.from('addresses').select('id,user_id').eq('user_id', userId).limit(5);
  const { data: restaurants } = await supabase.from('restaurants').select('id').limit(5);

  console.log('profiles', profiles);
  console.log('addresses', addresses);
  console.log('restaurants', restaurants);

  const addressId = addresses?.[0]?.id ?? 2;
  const restaurantId = restaurants?.[0]?.id ?? 1;

  const { data: inserted, error: insertError } = await supabase.from('orders').insert([
    {
      user_id: userId,
      restaurant_id: restaurantId,
      address_id: addressId,
      total_amount: 199,
      payment_method: 'cod',
      payment_status: 'pending'
    }
  ]).select('*').single();

  if (insertError) {
    console.error('INSERT_ERROR', insertError);
    process.exitCode = 1;
    return;
  }

  console.log('INSERTED', JSON.stringify(inserted, null, 2));

  const { data: constraintData, error: schemaError } = await supabase
    .from('information_schema.columns')
    .select('column_name, column_default, is_nullable, data_type')
    .eq('table_name', 'orders')
    .eq('table_schema', 'public');

  if (schemaError) {
    console.error('SCHEMA_ERROR', schemaError);
    process.exitCode = 1;
    return;
  }

  const orderStatusColumn = (constraintData || []).find((row) => row.column_name === 'order_status');
  console.log('ORDER_STATUS_SCHEMA', JSON.stringify(orderStatusColumn, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
