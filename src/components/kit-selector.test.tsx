import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitSelector } from "@/components/kit-selector";
import { COMPLETE_SET, GUIDES } from "@/lib/catalog";

const draftStorageKey = "home-kit-selection";

describe("KitSelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("requires a guide and valid email before continuing", async () => {
    const user = userEvent.setup();

    render(<KitSelector guides={GUIDES} />);

    const continueButton = screen.getByRole("button", {
      name: /continue to payment/i,
    });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /first 30 days/i }));
    await user.type(screen.getByLabelText(/email address/i), "buyer@example.com");

    expect(screen.getByText("1 guide selected.")).toBeInTheDocument();
    expect(screen.getAllByText("$12")).toHaveLength(3);
    expect(continueButton).toBeEnabled();
  });

  it("supports keyboard selection with native checkbox semantics", async () => {
    const user = userEvent.setup();

    render(<KitSelector guides={GUIDES} />);

    const firstGuide = screen.getByRole("checkbox", { name: /first 30 days/i });
    const firstPreview = screen.getAllByRole("link", { name: /preview guide/i })[0];

    await user.tab();
    expect(firstGuide).toHaveFocus();

    await user.keyboard(" ");
    expect(firstGuide).toBeChecked();

    await user.tab();
    expect(firstPreview).toHaveFocus();
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
      screen.getByRole("button", { name: /continue to payment/i }),
    ).toBeEnabled();
  });

  it("shows saving and saved feedback without submitting a payment", async () => {
    const user = userEvent.setup();

    render(<KitSelector guides={GUIDES} />);

    await user.click(screen.getByRole("checkbox", { name: /first 30 days/i }));
    await user.type(screen.getByLabelText(/email address/i), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: /continue to payment/i }));

    expect(screen.getByRole("button", { name: /saving selection/i })).toBeDisabled();

    await waitFor(() => {
      expect(
        screen.getByText(/your selection is saved\. card payment will be connected/i),
      ).toBeInTheDocument();
    });
  });
});
