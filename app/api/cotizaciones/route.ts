import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asesor   = searchParams.get('asesor');
  const dateFrom = searchParams.get('from');
  const dateTo   = searchParams.get('to');

  const sb = getSupabase();
  let query = sb
    .from('sim_cotizaciones')
    .select('id, created_at, asesor_name, client_name, client_rut, client_email, project_name, commune, mode, share_link, resend_of')
    .order('created_at', { ascending: false })
    .limit(200);

  if (asesor)   query = query.eq('asesor_name', asesor);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo)   query = query.lte('created_at', dateTo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('sim_cotizaciones')
    .insert(body)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
