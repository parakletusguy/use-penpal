"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  importVerifiedIJSDSBatch,
  initialImportState,
} from "@/app/import/actions";

export function ImportButton({ alreadyImported }: { alreadyImported: boolean }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(importVerifiedIJSDSBatch, initialImportState);

  useEffect(() => {
    if (state.status === "success" && !alreadyImported) router.push("/manuscripts");
  }, [alreadyImported, router, state.status]);

  if (alreadyImported) {
    return <Link className="button button-primary" href="/manuscripts">Open 20 manuscripts</Link>;
  }

  return (
    <form action={formAction} className="import-action">
      <button className="button button-primary" disabled={isPending} type="submit">
        {isPending ? "Preparing batch…" : "Import verified IJSDS batch"}
      </button>
      {state.message ? <p className={`form-message ${state.status}`}>{state.message}</p> : null}
    </form>
  );
}
