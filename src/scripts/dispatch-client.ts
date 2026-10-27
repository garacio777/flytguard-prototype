import {
  DispatchApiErrorSchema,
  DispatchApiSuccessSchema,
  DispatchOutputSchema,
  DispatchRequestSchema,
  type DispatchOutput,
  type FlattenedValidationError
} from "../schemas/dispatch";

interface DemoPreset {
  readonly id: string;
  readonly projectSiteId: string;
  readonly rawMessage: string;
}

const DEMO_PRESETS: Readonly<Record<string, DemoPreset>> = {
  standard: {
    id: "standard",
    projectSiteId: "PROJ-1042",
    rawMessage:
      "Vi trenger en 8-tonns gravemaskin og to lysmaster levert til byggeplass i Ås i morgen kl 07:00"
  },
  multi: {
    id: "multi",
    projectSiteId: "PROJ-2088",
    rawMessage:
      "Bestiller 1 stk 15-tonns hjullaster med sertifisert maskinfører og 2 stk vibroplater 400 kg til grunnarbeid i Ski mandag kl 06:30."
  },
  invalid: {
    id: "invalid",
    projectSiteId: "BYGG-99",
    rawMessage: "Kort"
  }
};

const CONTRACT_SAMPLE_PAYLOAD: unknown = {
  confidenceScore: 0.96,
  needsHumanReview: false,
  items: [
    {
      category: "GRAVEMASKIN",
      modelSpecification: "8-tonns beltegraver",
      quantity: 1,
      deliveryLocation: "Byggeplass i Ås",
      requestedStartIso: "2026-10-28T07:00:00+01:00",
      requiresCertifiedOperator: false
    },
    {
      category: "STRØM_VARME_LYS",
      modelSpecification: "Mobil lysmast LED",
      quantity: 2,
      deliveryLocation: "Byggeplass i Ås",
      requestedStartIso: "2026-10-28T07:00:00+01:00",
      requiresCertifiedOperator: false
    }
  ],
  safetyNotes:
    "Kontroller adkomstvei og bæreevne for maskintransport før avlessing kl. 07:00."
};

type GateState = "idle" | "passed" | "failed";

function setGateStates(gate1: GateState, gate2: GateState, gate3: GateState): void {
  const applyState = (elementId: string, state: GateState): void => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove("is-passed", "is-failed");
    if (state === "passed") el.classList.add("is-passed");
    if (state === "failed") el.classList.add("is-failed");
  };

  applyState("gate-1-indicator", gate1);
  applyState("gate-2-indicator", gate2);
  applyState("gate-3-indicator", gate3);
}

function createJsonBlock(label: string, payload: unknown): HTMLElement {
  const wrapper = document.createElement("div");

  const heading = document.createElement("p");
  heading.className = "code-label";
  heading.textContent = label;

  const pre = document.createElement("pre");
  pre.className = "json-viewer";

  const code = document.createElement("code");
  code.textContent = JSON.stringify(payload, null, 2);

  pre.appendChild(code);
  wrapper.append(heading, pre);
  return wrapper;
}

function createValidationErrorList(flattened: FlattenedValidationError): HTMLElement {
  const list = document.createElement("ul");
  list.className = "error-list";

  for (const formErr of flattened.formErrors) {
    const item = document.createElement("li");
    item.textContent = formErr;
    list.appendChild(item);
  }

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (!messages) continue;
    for (const msg of messages) {
      const item = document.createElement("li");
      const fieldSpan = document.createElement("span");
      fieldSpan.className = "error-field-name";
      fieldSpan.textContent = `${field}: `;
      item.append(fieldSpan, document.createTextNode(msg));
      list.appendChild(item);
    }
  }

  return list;
}

function renderValidatedOutput(
  container: HTMLElement,
  output: DispatchOutput,
  rawEnvelope: unknown,
  bannerTitle: string,
  bannerSubtitle: string,
  bannerTone: "status-ok" | "status-warn"
): void {
  const banner = document.createElement("div");
  banner.className = `status-banner ${bannerTone}`;

  const title = document.createElement("p");
  title.className = "status-banner-title";
  title.textContent = bannerTitle;

  const text = document.createElement("p");
  text.className = "status-banner-text";
  text.textContent = bannerSubtitle;
  banner.append(title, text);

  const metricsRow = document.createElement("div");
  metricsRow.className = "metrics-row";

  const confidenceChip = document.createElement("span");
  confidenceChip.className = "metric-chip";
  confidenceChip.textContent = `Konfidens: ${Math.round(output.confidenceScore * 100)} %`;

  const reviewChip = document.createElement("span");
  reviewChip.className = "metric-chip";
  reviewChip.textContent = output.needsHumanReview
    ? "Manuell kontroll: PÅKREVD"
    : "Manuell kontroll: IKKE PÅKREVD";

  const countChip = document.createElement("span");
  countChip.className = "metric-chip";
  countChip.textContent = `Ordrelinjer: ${output.items.length}`;

  metricsRow.append(confidenceChip, reviewChip, countChip);

  const tableWrap = document.createElement("div");
  tableWrap.className = "items-table-wrap";

  const table = document.createElement("table");
  table.className = "items-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const col of ["Kategori", "Spesifikasjon", "Antall", "Leveringssted", "Start (ISO)", "Fører"]) {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");
  for (const item of output.items) {
    const row = document.createElement("tr");

    const catCell = document.createElement("td");
    const catTag = document.createElement("span");
    catTag.className = "category-tag";
    catTag.textContent = item.category;
    catCell.appendChild(catTag);

    const specCell = document.createElement("td");
    specCell.textContent = item.modelSpecification;

    const qtyCell = document.createElement("td");
    qtyCell.textContent = String(item.quantity);

    const locCell = document.createElement("td");
    locCell.textContent = item.deliveryLocation;

    const dateCell = document.createElement("td");
    dateCell.className = "mono";
    dateCell.textContent = item.requestedStartIso;

    const opCell = document.createElement("td");
    opCell.textContent = item.requiresCertifiedOperator ? "Ja (sertifisert)" : "Nei";

    row.append(catCell, specCell, qtyCell, locCell, dateCell, opCell);
    tbody.appendChild(row);
  }

  table.append(thead, tbody);
  tableWrap.appendChild(table);

  const safetyBox = document.createElement("div");
  safetyBox.className = "status-banner";
  const safetyTitle = document.createElement("p");
  safetyTitle.className = "status-banner-title";
  safetyTitle.textContent = "HMS- og driftsnotat (safetyNotes)";
  const safetyBody = document.createElement("p");
  safetyBody.className = "status-banner-text";
  safetyBody.textContent = output.safetyNotes || "Ingen særskilte merknader.";
  safetyBox.append(safetyTitle, safetyBody);

  const jsonBlock = createJsonBlock("Validert JSON-payload (DispatchOutputSchema)", rawEnvelope);

  container.replaceChildren(banner, metricsRow, tableWrap, safetyBox, jsonBlock);
}

function renderZodRejection(
  container: HTMLElement,
  httpStatus: number,
  headline: string,
  flattened: FlattenedValidationError | undefined,
  rawPayload: unknown
): void {
  const banner = document.createElement("div");
  banner.className = "status-banner status-err";

  const title = document.createElement("p");
  title.className = "status-banner-title";
  title.textContent = `BLOKKERT AV ZOD-KONTRAKT · HTTP ${httpStatus}`;

  const desc = document.createElement("p");
  desc.className = "status-banner-text";
  desc.textContent = headline;

  banner.append(title, desc);
  if (flattened) {
    banner.appendChild(createValidationErrorList(flattened));
  }

  const jsonBlock = createJsonBlock("Deterministisk Zod-feilrespons", rawPayload);
  container.replaceChildren(banner, jsonBlock);
}

function renderDiagnosticNotice(
  container: HTMLElement,
  httpStatus: number,
  message: string,
  rawPayload: unknown
): void {
  const banner = document.createElement("div");
  banner.className = "status-banner status-warn";

  const title = document.createElement("p");
  title.className = "status-banner-title";
  title.textContent = `ENDPUNKTSSTATUS · HTTP ${httpStatus}`;

  const desc = document.createElement("p");
  desc.className = "status-banner-text";
  desc.textContent = message;

  banner.append(title, desc);
  const jsonBlock = createJsonBlock("Rårespons fra /api/parse-dispatch", rawPayload);
  container.replaceChildren(banner, jsonBlock);
}

function initDispatchWorkspace(): void {
  const form = document.getElementById("dispatch-form");
  const siteInput = document.getElementById("projectSiteId");
  const messageInput = document.getElementById("rawMessage");
  const charCounter = document.getElementById("char-counter");
  const demoToggle = document.getElementById("demo-toggle");
  const submitBtn = document.getElementById("submit-btn");
  const previewContractBtn = document.getElementById("preview-contract-btn");
  const resultContainer = document.getElementById("result-container");
  const presetButtons = document.querySelectorAll<HTMLButtonElement>("[data-preset]");

  if (
    !(form instanceof HTMLFormElement) ||
    !(siteInput instanceof HTMLInputElement) ||
    !(messageInput instanceof HTMLTextAreaElement) ||
    !(charCounter instanceof HTMLElement) ||
    !(demoToggle instanceof HTMLInputElement) ||
    !(submitBtn instanceof HTMLButtonElement) ||
    !(previewContractBtn instanceof HTMLButtonElement) ||
    !(resultContainer instanceof HTMLElement)
  ) {
    return;
  }

  const updateCharCount = (): void => {
    const length = messageInput.value.trim().length;
    charCounter.textContent = `${length} / 500 tegn`;
    const isOutOfBounds = length > 0 && (length < 10 || length > 500);
    charCounter.classList.toggle("is-invalid", isOutOfBounds);
  };

  const setActivePresetButton = (presetId: string | null): void => {
    for (const btn of presetButtons) {
      btn.classList.toggle("is-active", btn.dataset.preset === presetId);
    }
  };

  const applyPreset = (presetId: string): void => {
    const preset = DEMO_PRESETS[presetId];
    if (!preset) return;
    siteInput.value = preset.projectSiteId;
    messageInput.value = preset.rawMessage;
    demoToggle.checked = true;
    setActivePresetButton(presetId);
    updateCharCount();
  };

  demoToggle.addEventListener("change", () => {
    if (demoToggle.checked) {
      applyPreset("standard");
    } else {
      siteInput.value = "";
      messageInput.value = "";
      setActivePresetButton(null);
      updateCharCount();
    }
  });

  for (const btn of presetButtons) {
    btn.addEventListener("click", () => {
      const presetId = btn.dataset.preset;
      if (presetId) {
        applyPreset(presetId);
      }
    });
  }

  messageInput.addEventListener("input", () => {
    updateCharCount();
  });

  previewContractBtn.addEventListener("click", () => {
    const candidateRequest: unknown = {
      projectSiteId: siteInput.value,
      rawMessage: messageInput.value
    };

    const localInputCheck = DispatchRequestSchema.safeParse(candidateRequest);
    if (!localInputCheck.success) {
      const flattened = localInputCheck.error.flatten();
      setGateStates("failed", "idle", "idle");
      renderZodRejection(
        resultContainer,
        400,
        "Gate 1 (DispatchRequestSchema) avviste input deterministisk før nettverkskall.",
        flattened,
        {
          error: "Valideringsfeil i input (lokal kontraktsjekk)",
          details: flattened
        }
      );
      return;
    }

    const verifiedSample = DispatchOutputSchema.safeParse(CONTRACT_SAMPLE_PAYLOAD);
    if (!verifiedSample.success) {
      return;
    }

    setGateStates("passed", "passed", "passed");
    renderValidatedOutput(
      resultContainer,
      verifiedSample.data,
      { status: "VALIDATED", data: verifiedSample.data },
      "KONTRAKTEKSEMPEL · DispatchOutputSchema.safeParse() OK",
      "Lokal visning av deterministisk skjemakontrakt (uten oppstrøms API-kall).",
      "status-warn"
    );
  });

  form.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();

    const requestBody = {
      projectSiteId: siteInput.value,
      rawMessage: messageInput.value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Validerer mot /api/parse-dispatch ...";
    setGateStates("idle", "idle", "idle");

    try {
      const response = await fetch("/api/parse-dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      let rawJson: unknown = null;
      try {
        rawJson = await response.json();
      } catch {
        rawJson = {
          error: "Endepunktet returnerte ikke JSON (sjekk at Cloudflare Pages Worker kjører)."
        };
      }

      if (response.ok) {
        const parsedSuccess = DispatchApiSuccessSchema.safeParse(rawJson);
        if (!parsedSuccess.success) {
          setGateStates("passed", "passed", "failed");
          renderZodRejection(
            resultContainer,
            422,
            "Klientens Zod-kontrakt blokkerte et uventet svarformat.",
            parsedSuccess.error.flatten(),
            rawJson
          );
          return;
        }

        setGateStates("passed", "passed", "passed");
        renderValidatedOutput(
          resultContainer,
          parsedSuccess.data.data,
          parsedSuccess.data,
          "VALIDATED · HTTP 200 (Zone 4 Edge Worker)",
          "Både brukerinput (Gate 1) og AI-respons (Gate 3) passerte streng Zod-validering.",
          "status-ok"
        );
        return;
      }

      const parsedErr = DispatchApiErrorSchema.safeParse(rawJson);
      if (parsedErr.success) {
        if (response.status === 400 && parsedErr.data.details) {
          setGateStates("failed", "idle", "idle");
          renderZodRejection(
            resultContainer,
            400,
            parsedErr.data.error,
            parsedErr.data.details,
            parsedErr.data
          );
          return;
        }

        if (response.status === 422) {
          setGateStates("passed", "passed", "failed");
          renderZodRejection(
            resultContainer,
            422,
            parsedErr.data.error,
            parsedErr.data.violations,
            parsedErr.data
          );
          return;
        }

        if (response.status === 502 || response.status === 503) {
          setGateStates("passed", "failed", "idle");
          renderDiagnosticNotice(
            resultContainer,
            response.status,
            parsedErr.data.error,
            parsedErr.data
          );
          return;
        }
      }

      // Fallback when running static preview (e.g. `astro preview` without Wrangler Pages Functions)
      const localCheck = DispatchRequestSchema.safeParse(requestBody);
      if (!localCheck.success) {
        const flattened = localCheck.error.flatten();
        setGateStates("failed", "idle", "idle");
        renderZodRejection(
          resultContainer,
          400,
          "Zone 4 Worker er ikke tilkoblet i statisk forhåndsvisning, men Gate 1 (DispatchRequestSchema) avviste input:",
          flattened,
          {
            httpStatus: response.status,
            error: "Valideringsfeil i input",
            details: flattened
          }
        );
        return;
      }

      setGateStates("passed", "failed", "idle");
      renderDiagnosticNotice(
        resultContainer,
        response.status,
        "Zone 1 statisk UI kjører uten tilkoblet Cloudflare Pages Worker. Kjør `npx wrangler pages dev dist` eller distribuer til Cloudflare Pages for live `/api/parse-dispatch`.",
        rawJson
      );
    } catch {
      setGateStates("idle", "failed", "idle");
      renderDiagnosticNotice(
        resultContainer,
        0,
        "Nettverksfeil ved kall til `/api/parse-dispatch`. Kontroller tilkobling eller lokal Wrangler-instans.",
        { error: "Nettverksfeil" }
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Valider og tolk bestilling (POST /api/parse-dispatch)";
    }
  });

  // Initialize with pre-filled Norwegian demo active
  applyPreset("standard");
}

initDispatchWorkspace();
