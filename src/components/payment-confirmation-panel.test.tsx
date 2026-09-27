import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PaymentConfirmationPanel,
  paymentConfirmationPolling,
} from "@/components/payment-confirmation-panel";

const reference = "hkt_4pX9Xq21bL8vK3mN";
const confirmation = "Ba9tJwk9NhHTB7PRU1_3xx5EiGCqERvhfA9th4YHvmQ";

describe("PaymentConfirmationPanel", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("treats callback arrival as pending until the server confirms fulfillment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "pending" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PaymentConfirmationPanel confirmation={confirmation} reference={reference} />);

    expect(
      screen.getByRole("heading", { name: /we are confirming your payment/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("shows safe fulfilled details and only uses a download action supplied by the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "fulfilled",
            guideCount: 2,
            maskedEmail: "b***@example.com",
            downloadPath: "/downloads/opaque-access-token",
          }),
          { status: 200 },
        ),
      ),
    );

    render(<PaymentConfirmationPanel confirmation={confirmation} reference={reference} />);

    expect(
      await screen.findByRole("heading", { name: /your 2 guides are ready/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/b\*\*\*@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download your guides/i })).toHaveAttribute(
      "href",
      "/downloads/opaque-access-token",
    );
  });

  it("checks the server again after a page revisit instead of trusting browser state", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(
        JSON.stringify({
          status: "fulfilled",
          guideCount: 1,
          maskedEmail: "b***@example.com",
          downloadPath: null,
        }),
        { status: 200 },
      ),
    ));
    vi.stubGlobal("fetch", fetchMock);

    const firstVisit = render(
      <PaymentConfirmationPanel confirmation={confirmation} reference={reference} />,
    );
    await screen.findByRole("heading", { name: /your 1 guide is ready/i });
    firstVisit.unmount();

    render(<PaymentConfirmationPanel confirmation={confirmation} reference={reference} />);
    await screen.findByRole("heading", { name: /your 1 guide is ready/i });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("updates after a delayed webhook fulfillment without treating callback arrival as success", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "pending" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "fulfilled",
            guideCount: 1,
            maskedEmail: "b***@example.com",
            downloadPath: null,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PaymentConfirmationPanel confirmation={confirmation} reference={reference} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: /we are confirming your payment/i }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(paymentConfirmationPolling.intervalMs);
    });

    expect(
      screen.getByRole("heading", { name: /your 1 guide is ready/i }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives a separate payment retry path for a failed payment without downloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "failed" }), { status: 200 }),
      ),
    );

    render(<PaymentConfirmationPanel confirmation={confirmation} reference={reference} />);

    expect(
      await screen.findByRole("heading", { name: /could not confirm a successful payment/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start a new payment/i })).toHaveAttribute(
      "href",
      "/?retry=payment",
    );
    expect(screen.queryByRole("link", { name: /download your guides/i })).not.toBeInTheDocument();
  });

  it("does not call the status endpoint for an invalid or incomplete callback", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PaymentConfirmationPanel confirmation="" reference={reference} />);

    expect(
      screen.getByRole("heading", { name: /could not find a payment to confirm/i }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops polling and offers support after the capped confirmation period", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "pending" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PaymentConfirmationPanel confirmation={confirmation} reference={reference} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        paymentConfirmationPolling.intervalMs * paymentConfirmationPolling.maxAttempts,
      );
    });

    expect(
      screen.getByRole("heading", { name: /we are still confirming your payment/i }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(paymentConfirmationPolling.maxAttempts);
  });
});
