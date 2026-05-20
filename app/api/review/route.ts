import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { approveField, type ApproveFieldInput } from "@/lib/field-reviews";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: Partial<ApproveFieldInput>;
  try {
    body = (await req.json()) as Partial<ApproveFieldInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { extractionId, fieldName } = body;
  if (!extractionId || !fieldName) {
    return NextResponse.json(
      { error: "extractionId and fieldName are required" },
      { status: 400 },
    );
  }

  try {
    const row = await approveField(supabase, {
      extractionId,
      fieldName,
      originalValue: body.originalValue ?? null,
      finalValue: body.finalValue ?? null,
      confidence: body.confidence ?? null,
      bbox: body.bbox ?? null,
    });
    return NextResponse.json({ review: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
