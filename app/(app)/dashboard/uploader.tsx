"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/spinner";

type UploaderProps = {
  onChange?: () => void | Promise<void>;
};

export function Uploader({ onChange }: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function triggerExtract(documentId: string) {
    try {
      await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
    } catch {
      // Extract API also flips status to error on failure; polling will surface it.
    }
  }

  async function handleFiles(files: FileList) {
    setError(null);
    setIsUploading(true);
    const supabase = createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setError("Not authenticated");
      setIsUploading(false);
      return;
    }

    try {
      for (const file of Array.from(files)) {
        const documentId = crypto.randomUUID();
        const storagePath = `${user.id}/${documentId}-${file.name}`;

        const insertRes = await supabase.from("documents").insert({
          id: documentId,
          user_id: user.id,
          file_name: file.name,
          storage_path: storagePath,
          status: "pending",
        });

        if (insertRes.error) {
          throw new Error(insertRes.error.message);
        }

        // Surface the new row immediately so the user sees it in 'pending' state.
        await onChange?.();

        const uploadRes = await supabase.storage
          .from("documents")
          .upload(storagePath, file, {
            contentType: file.type || "application/pdf",
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
          continue;
        }

        // Kick off extraction; don't await — polling will pick up status transitions.
        void triggerExtract(documentId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      await onChange?.();
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files);
          }
        }}
      />
      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-navy px-4 py-2 font-sans text-sm text-white transition-all duration-150 hover:bg-navy-mid disabled:opacity-60"
      >
        {isUploading && <Spinner size={14} />}
        <span>{isUploading ? "Uploading…" : "Upload PDFs"}</span>
      </button>
      {error && (
        <span className="font-mono text-xs text-[var(--gray-600)]">
          {error}
        </span>
      )}
    </div>
  );
}
