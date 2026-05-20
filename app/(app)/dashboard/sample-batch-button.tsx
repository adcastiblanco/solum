"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/spinner";

const SAMPLE_FILES = [
  "02-referral-letter.pdf",
  "03-insurance-card.pdf",
  "04-lab-results.pdf",
  "05-patient-intake-form.pdf",
  "06-handwritten-clinical-note.pdf",
  "07-service-request-form.pdf",
];

type Props = {
  onChange?: () => void | Promise<void>;
};

export function SampleBatchButton({ onChange }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function processOne(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    fileName: string,
  ) {
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/samples/${fileName}`;

    const res = await fetch(publicUrl);
    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${fileName}`);
    }
    const blob = await res.blob();

    const documentId = crypto.randomUUID();
    const storagePath = `${userId}/${documentId}-${fileName}`;

    const insertRes = await supabase.from("documents").insert({
      id: documentId,
      user_id: userId,
      file_name: fileName,
      storage_path: storagePath,
      status: "pending",
    });
    if (insertRes.error) throw new Error(insertRes.error.message);

    // Surface the row right away so the user sees pending state.
    await onChange?.();

    const uploadRes = await supabase.storage
      .from("documents")
      .upload(storagePath, blob, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadRes.error) {
      await supabase
        .from("documents")
        .update({
          status: "error",
          error_message: `Upload failed: ${uploadRes.error.message}`,
        })
        .eq("id", documentId);
      await onChange?.();
      return;
    }

    void fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
  }

  async function handleClick() {
    if (running) return;
    setError(null);
    setRunning(true);

    const supabase = createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setError("Not authenticated");
      setRunning(false);
      return;
    }

    try {
      await Promise.all(
        SAMPLE_FILES.map((name) =>
          processOne(supabase, user.id, name).catch((e) => {
            console.error(`Sample batch: skipping ${name}`, e);
          }),
        ),
      );
    } finally {
      setRunning(false);
      await onChange?.();
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={running}
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-navy px-4 py-2 font-sans text-sm text-white transition-all duration-150 hover:bg-navy-mid disabled:opacity-60"
      >
        {running && <Spinner size={14} />}
        <span>{running ? "Running sample batch…" : "Run sample batch"}</span>
      </button>
      {error && (
        <span className="font-mono text-xs text-[var(--gray-600)]">
          {error}
        </span>
      )}
    </div>
  );
}
