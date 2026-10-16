// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RollingNumber from "./rolling-number";

describe("RollingNumber", () => {
  it("shows the first value without any effect", () => {
    const { container } = render(<RollingNumber value={248} size={108} showDelta />);
    expect(container.querySelectorAll("[data-digit]")).toHaveLength(3);
    expect(container.querySelector("[data-delta]")).toBeNull();
    expect(container.querySelector("[data-flash]").getAttribute("data-flash")).toBe("false");
  });

  it("rolls, glows and shows +N when the value rises", () => {
    const { container, rerender } = render(<RollingNumber value={248} size={108} showDelta />);
    rerender(<RollingNumber value={251} size={108} showDelta />);
    expect(container.querySelector("[data-delta]").textContent).toBe("+3");
    expect(container.querySelector("[data-flash]").getAttribute("data-flash")).toBe("true");
  });

  it("keeps the comma of a thousands figure as a plain character", () => {
    const { container } = render(<RollingNumber value={1100} size={140} />);
    expect(container.querySelectorAll("[data-digit]")).toHaveLength(4);
    expect(container.textContent).toContain(",");
  });

  it("shows a dash for an unknown value", () => {
    const { container } = render(<RollingNumber value={null} size={108} />);
    expect(container.textContent).toBe("—");
  });
});
