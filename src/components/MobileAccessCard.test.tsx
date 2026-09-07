import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileAccessCard } from "./MobileAccessCard";

describe("MobileAccessCard", () => {
  it("explains the mobile web flow without naming the hosting provider", () => {
    const html = renderToStaticMarkup(
      <MobileAccessCard webAppUrl="https://relaydrop.example/" />
    );

    expect(html).toContain("Use RelayDrop on your phone");
    expect(html).toContain("same Microsoft account");
    expect(html).toContain("relaydrop.example");
    expect(html).not.toContain("Azure");
  });

  it("keeps instructions visible when a build has no configured URL", () => {
    const html = renderToStaticMarkup(<MobileAccessCard />);

    expect(html).toContain("has not been configured");
    expect(html).not.toContain("Open web app");
  });
});
