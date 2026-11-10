import {describe,expect,it} from "vitest";
import {distinctProjectLabels} from "./project-reference";

describe("distinct project labels",()=>{
  it("adds only enough parent context to distinguish collisions, including equal parent names on different drives",()=>{
    const rows=[{project:"F:/Demo/Studio/Atlas",displayName:"Atlas"},{project:"F:/Demo/Research/Atlas",displayName:"Atlas"},{project:"G:/Demo/Studio/Atlas",displayName:"Atlas"},{project:"F:/Demo/Pulse",displayName:"Pulse"}];
    const labels=distinctProjectLabels(rows);
    expect(labels.get(rows[0].project)).toBe("F:/Demo/Studio/Atlas");
    expect(labels.get(rows[1].project)).toBe("Research/Atlas");
    expect(labels.get(rows[2].project)).toBe("G:/Demo/Studio/Atlas");
    expect(labels.get(rows[3].project)).toBe("Pulse");
  });
});
