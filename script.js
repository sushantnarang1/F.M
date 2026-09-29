(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".site-nav");

  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      navigation.classList.toggle("is-open", !open);
    });
    navigation.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        menuButton.setAttribute("aria-expanded", "false");
        navigation.classList.remove("is-open");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
        menuButton.setAttribute("aria-expanded", "false");
        navigation.classList.remove("is-open");
        menuButton.focus();
      }
    });
  }

  const formatDate = (value, allDay) => {
    const date = new Date(allDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: allDay ? "UTC" : "America/New_York",
      ...(allDay ? {} : { hour: "numeric", minute: "2-digit" })
    }).format(date);
  };
  const formatTimeRange = (event) => {
    if (event.allDay) return "All day";
    const start = new Date(event.start);
    const end = new Date(event.end);
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    return `${time.format(start)}–${time.format(end)}`;
  };
  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const makeEvent = (event) => {
    const article = document.createElement("article");
    article.className = "event-row";
    const date = document.createElement("div");
    date.className = "event-date";
    date.textContent = formatDate(event.start, event.allDay);
    const details = document.createElement("div");
    details.className = "event-details";
    const title = document.createElement("h2");
    title.textContent = String(event.title || "");
    details.append(title);
    const meta = document.createElement("p");
    meta.className = "event-meta";
    meta.textContent = [formatTimeRange(event), event.location].filter(Boolean).join(" · ");
    details.append(meta);
    if (event.description) {
      const description = document.createElement("p");
      description.className = "event-description";
      description.textContent = event.description;
      details.append(description);
    }
    const actions = document.createElement("div");
    actions.className = "event-actions";
    const calendarUrl = safeUrl(event.htmlLink);
    if (calendarUrl) {
      const calendarLink = document.createElement("a");
      calendarLink.href = calendarUrl;
      calendarLink.target = "_blank";
      calendarLink.rel = "noreferrer";
      calendarLink.textContent = "View details / add to calendar ↗";
      actions.append(calendarLink);
    }
    const contactLink = document.createElement("a");
    const query = new URLSearchParams({ reason: "event", event: event.title });
    contactLink.href = `/contact/?${query.toString()}`;
    contactLink.textContent = "Contact us about this event ↗";
    actions.append(contactLink);
    article.append(date, details, actions);
    return article;
  };

  const loadEvents = async () => {
    const lists = document.querySelectorAll("[data-event-list]");
    if (!lists.length) return;
    try {
      const response = await fetch("/data/events.json", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("events unavailable");
      const data = await response.json();
      const now = Date.now();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(new Date());
      const today = `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
      const events = (Array.isArray(data.events) ? data.events : [])
        .filter((event) => event && typeof event.title === "string" && Number.isFinite(Date.parse(event.start)) &&
          (event.allDay ? event.end > today : Date.parse(event.end) >= now))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      for (const list of lists) {
        list.replaceChildren();
        const limit = Number(list.dataset.limit) || events.length;
        const visible = events.slice(0, limit);
        if (!visible.length) {
          const empty = document.createElement("p");
          empty.className = "event-empty";
          empty.textContent = "No public events are currently scheduled. Please check back soon.";
          list.append(empty);
        } else {
          visible.forEach((event) => list.append(makeEvent(event)));
        }
      }
    } catch {
      lists.forEach((list) => {
        const message = document.createElement("p");
        message.className = "event-empty";
        message.textContent = "Public event information is temporarily unavailable. Please check back soon.";
        list.replaceChildren(message);
      });
    }
  };
  loadEvents();

  const calendarFrame = document.querySelector("[data-calendar-embed] iframe");
  const calendarEmbed = document.querySelector("[data-calendar-embed]");
  if (calendarFrame && calendarEmbed && window.LODGE_SITE_CONFIG?.publicCalendarId) {
    const source = new URL("https://calendar.google.com/calendar/embed");
    source.searchParams.set("src", window.LODGE_SITE_CONFIG.publicCalendarId);
    source.searchParams.set("ctz", "America/New_York");
    source.searchParams.set("mode", "AGENDA");
    calendarFrame.src = source.href;
    calendarEmbed.hidden = false;
  }

  const galleryButtons = document.querySelectorAll(".gallery-open");
  const imageDialog = document.querySelector(".image-dialog");
  if (galleryButtons.length && imageDialog instanceof HTMLDialogElement) {
    const image = imageDialog.querySelector("img");
    const caption = imageDialog.querySelector("p");
    galleryButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const imagePath = button.dataset.image || "";
        if (!imagePath.startsWith("/") || imagePath.startsWith("//") || !image) return;
        const source = new URL(imagePath, location.origin).href;
        image.src = source;
        image.alt = button.dataset.alt || "";
        caption.textContent = button.closest("figure")?.querySelector("figcaption")?.textContent || "";
        imageDialog.showModal();
      });
    });
    imageDialog.querySelector(".image-dialog-close")?.addEventListener("click", () => imageDialog.close());
    imageDialog.addEventListener("click", (event) => {
      if (event.target === imageDialog) imageDialog.close();
    });
  }

  const form = document.querySelector("#inquiry-form");
  if (!(form instanceof HTMLFormElement)) return;
  const status = document.querySelector("#form-status");
  const submit = document.querySelector("#submit-button");
  const reason = document.querySelector("#reason");
  const orgReason = document.querySelector("#organization-reason");
  const hiddenType = document.querySelector("#inquiry-type-value");
  const intro = document.querySelector("#form-intro");
  const historicalHelp = document.querySelector("#historical-help");
  const individualFields = document.querySelectorAll(".individual-only");
  const orgFields = document.querySelectorAll(".organization-only");
  const config = window.LODGE_SITE_CONFIG || {};

  const configureType = (type) => {
    const organization = type === "organization";
    hiddenType.value = type;
    individualFields.forEach((field) => {
      field.hidden = organization;
      field.querySelector("input").required = !organization;
    });
    orgFields.forEach((field) => {
      field.hidden = !organization;
      const input = field.querySelector("input, select");
      if (input) input.required = organization && field.dataset.field !== "organizationType";
    });
    reason.closest(".field").hidden = organization;
    reason.required = !organization;
    orgReason.closest(".field").hidden = !organization;
    orgReason.required = organization;
    intro.textContent = organization
      ? "Representing a community organization, historical society, nonprofit, Masonic body, or local institution? Contact us about partnerships, events, historical research, and community opportunities."
      : "Have a question about Freemasonry, our Lodge, or our history? We'd be glad to hear from you.";
    updateHistoricalHelp();
  };
  const updateHistoricalHelp = () => {
    if (!historicalHelp) return;
    const selectedReason = hiddenType.value === "organization" ? orgReason.value : reason.value;
    historicalHelp.hidden = ![
      "Lodge History / Historical Research",
      "Historical Photograph or Document",
      "Historical Research"
    ].includes(selectedReason);
  };
  document.querySelectorAll('input[name="contactingAs"]').forEach((radio) => {
    radio.addEventListener("change", () => configureType(radio.value));
  });
  reason.addEventListener("change", updateHistoricalHelp);
  orgReason.addEventListener("change", updateHistoricalHelp);
  configureType(new URLSearchParams(location.search).get("type") === "organization" ? "organization" : "individual");
  const eventName = new URLSearchParams(location.search).get("event");
  const initialReason = new URLSearchParams(location.search).get("reason");
  if (eventName) {
    document.querySelector("#related-event").value = eventName.slice(0, 200);
    reason.value = "Events";
  } else if (initialReason === "history") {
    reason.value = "Lodge History / Historical Research";
  } else if (initialReason === "visit") {
    reason.value = "Visiting the Lodge";
  } else if (initialReason === "membership") {
    reason.value = "Interested in Freemasonry";
  } else if (initialReason === "events") {
    reason.value = "Events";
  }
  updateHistoricalHelp();

  if (config.turnstileSiteKey && config.inquiryApiUrl) {
    const slot = document.querySelector("#turnstile-slot");
    const widget = document.createElement("div");
    widget.className = "cf-turnstile";
    widget.dataset.sitekey = config.turnstileSiteKey;
    slot.append(widget);
    const challengeScript = document.createElement("script");
    challengeScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    challengeScript.async = true;
    challengeScript.defer = true;
    document.head.append(challengeScript);
  } else {
    status.classList.add("form-warning");
    status.textContent = "The online inquiry form is being configured. For now, please contact the Lodge Secretary directly by email or phone.";
    submit.disabled = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || !config.inquiryApiUrl || !config.turnstileSiteKey) return;
    const formData = new FormData(form);
    const type = hiddenType.value;
    const data = {
      inquiryType: type,
      name: type === "individual" ? formData.get("name") : formData.get("contactPerson"),
      organization: type === "organization" ? formData.get("organization") : "",
      contactPerson: type === "organization" ? formData.get("contactPerson") : "",
      email: formData.get("email"),
      phone: formData.get("phone"),
      organizationType: type === "organization" ? formData.get("organizationType") : "",
      reason: type === "organization" ? formData.get("organizationReason") : formData.get("reason"),
      relatedEvent: formData.get("relatedEvent"),
      message: formData.get("message"),
      website: formData.get("website"),
      turnstileToken: formData.get("cf-turnstile-response")
    };
    if (!data.turnstileToken) {
      status.textContent = "Please complete the spam-prevention check.";
      return;
    }
    submit.disabled = true;
    status.textContent = "Sending your inquiry…";
    try {
      const response = await fetch(config.inquiryApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("submission failed");
      const result = await response.json();
      if (result.status !== "received") throw new Error("submission failed");
      const historical = ["Lodge History / Historical Research", "Historical Photograph or Document", "Historical Research"].includes(data.reason);
      location.assign(`/thank-you/${historical ? "?historical=1" : ""}`);
    } catch {
      status.textContent = "We couldn't send your inquiry just now. Please try again later or contact the Lodge Secretary by email.";
      submit.disabled = false;
    }
  });
})();
