import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitSelector } from "@/components/kit-selector";
import { COMPLETE_SET, GUIDES } from "@/lib/catalog";

const draftStorageKey = "home-kit-selection";

describe("KitSelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requires a guide and valid email before continuing", async () => {
    const user = userEvent.setup();

    render(<KitSelector guides={GUIDES} />);

    const continueButton = screen.getByRole("button", {
      name: /pay securely/i,
    });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /first 30 days/i }));
    await user.type(screen.getByLabelText(/email address/i), "buyer@example.com");

    expect(screen.getByText("1 guide selected.")).toBeInTheDocument();
    expect(screen.getAllByText("$12")).toHaveLength(3);
    expect(continueButton).toBeEnabled();
  });

  it("supports keyboard selection of the complete set with native checkbox semantics", async () => {
    const user = userEvent.setup();

    render(<KitSelector guides={GUIDES} />);

    const completeSet = screen.getByRole("checkbox", { name: /complete new homeowner system/i });

    await user.tab();
    expect(completeSet).toHaveFocus();

    await user.keyboard(" ");
    expect(completeSet).toBeChecked();
  });

  it("replaces the complete set when an individual guide is selected", async () => {
    const user = userEvent.setup();

    render(<KitSelector guides={GUIDES} />);

    const completeSet = screen.getByRole("checkbox", {
      name: new RegExp(COMPLETE_SET.title, "i"),
    });
    const individualGuide = screen.getByRole("checkbox", { name: /first 30 days/i });

    await user.click(completeSet);
    expect(completeSet).toBeChecked();
    expect(screen.getByText("Bundle saving")).toBeInTheDocument();

    await user.click(individualGuide);

    expect(completeSet).not.toBeChecked();
    expect(individualGuide).toBeChecked();
    expect(
      screen.getByText(/complete set was replaced with your individual/i),
    ).toBeInTheDocument();
  });

  it("uses the server-supplied complete-set price in its payment summary", async () => {
    const user = userEvent.setup();

    render(
      <KitSelector
        completeSet={{ ...COMPLETE_SET, priceInCents: 6500 }}
        guides={GUIDES}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: new RegExp(COMPLETE_SET.title, "i") }),
    );

    expect(screen.getAllByText("$65")).toHaveLength(2);
  });

  it("shows an accessible error for an invalid email address", async () => {
    const user = userEvent.setup();

    render(<KitSelector guides={GUIDES} />);

    await user.click(screen.getByLabelText(/email address/i));
    await user.type(screen.getByLabelText(/email address/i), "not-an-email");
    await user.tab();

    const email = screen.getByLabelText(/email address/i);
    await waitFor(() => {
      expect(email).toHaveAttribute("aria-invalid", "true");
    });
    expect(email).toHaveAttribute("aria-describedby", "email-help email-error");
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("restores a valid saved draft after the selector mounts", async () => {
    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({ email: "buyer@example.com", productIds: [GUIDES[0].id] }),
    );

    render(<KitSelector guides={GUIDES} />);

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /first 30 days/i })).toBeChecked();
    });

    expect(screen.getByLabelText(/email address/i)).toHaveValue("buyer@example.com");
    expect(
      screen.getByRole("button", { name: /pay securely/i }),
    ).toBeEnabled();
  });

  it("preselects the complete set from a campaign link", async () => {
    window.history.pushState({}, "", "/?selection=complete#kit-selector");

    render(<KitSelector guides={GUIDES} />);

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: /complete new homeowner system/i }),
      ).toBeChecked();
    });
  });

  it("submits only email and product IDs and retains the draft after an initialization failure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "PAYMENT_UNAVAILABLE",
            message: "We could not start your payment. Please try again.",
          },
        }),
        { status: 502 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<KitSelector guides={GUIDES} />);

    await user.click(screen.getByRole("checkbox", { name: /first 30 days/i }));
    await user.type(screen.getByLabelText(/email address/i), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: /pay securely/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/checkout",
      expect.objectContaining({
        body: JSON.stringify({ email: "buyer@example.com", productIds: [GUIDES[0].id] }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        method: "POST",
      }),
    );

    expect(screen.getByText(/we could not start your payment/i)).toBeInTheDocument();
    expect(screen.getByText("Secure checkout could not start.")).toBeInTheDocument();
    expect(window.localStorage.getItem(draftStorageKey)).toContain("buyer@example.com");

    await user.click(screen.getByRole("button", { name: /pay securely/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const firstHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit)
      .headers as Record<string, string>;
    const secondHeaders = (fetchMock.mock.calls[1]?.[1] as RequestInit)
      .headers as Record<string, string>;
    expect(secondHeaders["Idempotency-Key"]).not.toBe(firstHeaders["Idempotency-Key"]);
  });

  it("prevents repeated checkout requests while checkout creation is in progress", async () => {
    const user = userEvent.setup();
    let resolveRequest: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<KitSelector guides={GUIDES} />);

    await user.click(screen.getByRole("checkbox", { name: /first 30 days/i }));
    await user.type(screen.getByLabelText(/email address/i), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: /pay securely/i }));

    expect(screen.getByRole("button", { name: /starting secure payment/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /starting secure payment/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRequest?.(
      new Response(
        JSON.stringify({
          error: { code: "PAYMENT_UNAVAILABLE", message: "Try again." },
        }),
        { status: 502 },
      ),
    );
    await waitFor(() => {
      expect(screen.getByText("Try again.")).toBeInTheDocument();
    });
  });
});
