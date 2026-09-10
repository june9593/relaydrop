import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileAccessCard } from "./MobileAccessCard";

describe("MobileAccessCard", () => {
  it("points Android users to the extension store", () => {
    const html = renderToStaticMarkup(
      <MobileAccessCard />
    );

    expect(html).toContain("Edge on Android");
    expect(html).toContain("same Microsoft account");
    expect(html).toContain("haadfdpcnjildomodlbpgapoemgdejef");
    expect(html).not.toContain("Azure");
  });

  it("does not direct mobile users to a hosted web app", () => {
    const html = renderToStaticMarkup(<MobileAccessCard />);

    expect(html).toContain("Open extension store");
    expect(html).not.toContain("Open web app");
  });
});
