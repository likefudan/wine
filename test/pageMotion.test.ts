import { describe, expect, it } from "vitest";
import { depthOf, motionFor } from "../src/web/pageMotion";

describe("page motion", () => {
  it("knows how deep a page is", () => {
    expect(depthOf("/")).toBe(0);
    expect(depthOf("/library")).toBe(0);
    expect(depthOf("/wine/abc")).toBe(1);
    expect(depthOf("/cellar/abc")).toBe(1);
    expect(depthOf("/cellar/new")).toBe(2);
    expect(depthOf("/taste/abc")).toBe(2);
    expect(depthOf("/add")).toBe(2);
  });

  it("opens forward, returns back, fades between tabs", () => {
    expect(motionFor("/", "/lists/1", false)).toBe("forward");
    expect(motionFor("/lists/1", "/taste/2", false)).toBe("forward");
    expect(motionFor("/add", "/taste/2", false)).toBe("forward");
    // 完成 on the form replaces it with the page it came from.
    expect(motionFor("/taste/2", "/lists/1", false)).toBe("back");
    expect(motionFor("/", "/library", false)).toBe("fade");
    expect(motionFor("/wine/1", "/me", false)).toBe("fade");
    expect(motionFor("/lists/1", "/", true)).toBe("back");
    expect(motionFor("/", "/lists/1", true)).toBe("forward");
    expect(motionFor("/me", "/me", false)).toBe("none");
    expect(motionFor("/cellar/new", "/cellar/9", false)).toBe("none");
  });
});
