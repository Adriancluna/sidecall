// PE view: onboard a portfolio company from the two CSVs any AP system exports (vendor master +
// open bills). The backend matches vendors, books the bills and, mid-incident, holds them on import.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ChangeEvent, type FormEvent } from "react";
import sampleBills from "../../data/samples/lakeside-open-bills.csv?raw";
import sampleVendors from "../../data/samples/lakeside-vendor-master.csv?raw";
import { api } from "../../convex/_generated/api";
import { ROLE_LABEL } from "../auth/directory";
import { DEMO_PASSWORD } from "../auth/useSignInAs";
import { friendlyError } from "../layout/errors";
import { money } from "./format";
import { Card, Chip, Empty } from "./ui";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD } from "./styles";

type Result = FunctionReturnType<typeof api.imports.importPortfolioCompany>;
type Files = { vendorsCsv: string; billsCsv: string };

const SAMPLE_COMPANY = {
  name: "Lakeside Orthopedics",
  domain: "lakesideortho.example",
  sector: "Healthcare",
  headcount: "450",
  apClerkName: "Morgan Ellis",
  controllerName: "Daniel Okoro",
};

export function ApImportPanel() {
  const [files, setFiles] = useState<Partial<Files>>({});
  const [company, setCompany] = useState(SAMPLE_COMPANY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const importCompany = useMutation(api.imports.importPortfolioCompany);
  const { vendorsCsv, billsCsv } = files;
  const ready = vendorsCsv !== undefined && billsCsv !== undefined;
  const usingSample = vendorsCsv === sampleVendors && billsCsv === sampleBills;
  const preview = useQuery(
    api.imports.previewApImport,
    ready ? { vendorsCsv, billsCsv } : "skip",
  );

  const readFile =
    (key: keyof Files) => async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      setFiles((f) => ({ ...f, [key]: text }));
      setResult(undefined);
    };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      setResult(
        await importCompany({
          vendorsCsv,
          billsCsv,
          company: { ...company, headcount: Number(company.headcount) },
        }),
      );
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof typeof SAMPLE_COMPANY, label: string) => (
    <label className="block text-xs text-ash">
      {label}
      <input
        name={key}
        required
        autoComplete="off"
        inputMode={key === "headcount" ? "numeric" : undefined}
        value={company[key]}
        onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
        className={`${FIELD} mt-1 w-full`}
      />
    </label>
  );

  return (
    <Card title="Onboard a company from its AP export">
      <p className="mb-3 max-w-prose text-sm text-ash">
        Two CSVs any AP system exports: the vendor master and open bills.
        Sidecall matches the vendors to the ones it already tracks and checks
        each bank account against the last one confirmed by phone.
      </p>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-ash">
            Vendor master
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void readFile("vendorsCsv")(e)}
              className="mt-1 block text-sm text-ash file:mr-2 file:min-h-9 file:cursor-pointer file:rounded-chip file:border-0 file:bg-panel file:px-3 file:text-sm file:font-medium file:text-paper file:ring-1 file:ring-line hover:file:bg-raised"
            />
          </label>
          <label className="text-xs text-ash">
            Open bills
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void readFile("billsCsv")(e)}
              className="mt-1 block text-sm text-ash file:mr-2 file:min-h-9 file:cursor-pointer file:rounded-chip file:border-0 file:bg-panel file:px-3 file:text-sm file:font-medium file:text-paper file:ring-1 file:ring-line hover:file:bg-raised"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setFiles({ vendorsCsv: sampleVendors, billsCsv: sampleBills });
              setCompany(SAMPLE_COMPANY);
              setResult(undefined);
            }}
            className={BUTTON_SECONDARY}
          >
            Use sample files
          </button>
          {usingSample && (
            <span className="text-xs text-ash">
              Using the Lakeside Orthopedics sample files.
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {text("name", "Company")}
          {text("domain", "Domain")}
          {text("sector", "Sector")}
          {text("headcount", "Headcount")}
          {text("apClerkName", "AP clerk (requests payments)")}
          {text("controllerName", "Controller (approves)")}
        </div>

        {ready && <Preview preview={preview} />}

        <button
          type="submit"
          disabled={!ready || busy || preview === null}
          className={BUTTON_PRIMARY}
        >
          {busy ? "Importing…" : "Import"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
      {result && <Imported result={result} />}
    </Card>
  );
}

function Preview({
  preview,
}: {
  preview: FunctionReturnType<typeof api.imports.previewApImport> | undefined;
}) {
  if (preview === undefined) return <Empty>Reading the files…</Empty>;
  if (preview === null) return <Empty>Only the PE firm can import.</Empty>;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {preview.vendors.length} vendors, {preview.bills} open bills,{" "}
        <span className="tabular-nums">{money(preview.totalCents)}</span>
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {preview.vendors.map((v) => (
          <li key={v.name} className="py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {v.name}
                {v.bankLast4 && (
                  <span className="ml-2 text-ash tabular-nums">
                    ••{v.bankLast4}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 text-xs text-ash">
                {v.openBills} open {v.openBills === 1 ? "bill" : "bills"}
                {v.matchedTo ? (
                  <Chip tone="muted">already tracked: {v.matchedTo}</Chip>
                ) : (
                  <Chip tone="muted">new vendor</Chip>
                )}
              </span>
            </div>
            {v.warning && (
              <p className="mt-1 text-sm text-danger">{v.warning}</p>
            )}
          </li>
        ))}
      </ul>
      {preview.problems.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-ash">
          {preview.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Imported({ result }: { result: Result }) {
  return (
    <div
      role="status"
      className="mt-4 space-y-2 border-t border-line pt-3 text-sm"
    >
      <p>
        {result.bills} bills booked
        {result.held > 0 && (
          <span className="text-amber">
            , {result.held} held on import ({money(result.heldCents)})
          </span>
        )}
        {result.exposedTo.length > 0 &&
          `, exposed to ${result.exposedTo.join(", ")}`}
      </p>
      <p className="text-ash">
        Sign in as{" "}
        {result.logins.map((l, i) => (
          <span key={l.email}>
            {i > 0 && " or "}
            <span className="text-paper">{l.name}</span> ({ROLE_LABEL[l.role]},{" "}
            {l.email})
          </span>
        ))}{" "}
        with the demo password{" "}
        <span className="font-semibold text-paper">{DEMO_PASSWORD}</span>.
      </p>
    </div>
  );
}
