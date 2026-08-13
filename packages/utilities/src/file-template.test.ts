import { describe, expect, it } from "vite-plus/test";
import { renderFileTemplate } from "./file-template.js";

describe("renderFileTemplate", () => {
  it("renders explicit values and rejects missing values", () => {
    expect(renderFileTemplate("Hello {{name}}", { name: "OpenBot" })).toBe("Hello OpenBot");
    expect(() => renderFileTemplate("Hello {{name}}")).toThrow();
  });

  it("requires triple braces for already encoded source fragments", () => {
    expect(renderFileTemplate("{{value}}", { value: '"module"' })).toBe("&quot;module&quot;");
    expect(renderFileTemplate("{{{value}}}", { value: '"module"' })).toBe('"module"');
  });
});
