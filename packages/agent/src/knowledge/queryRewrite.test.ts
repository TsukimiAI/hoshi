import { describe, expect, it } from "vitest";
import { parseQueries, rewriteQuery } from "./queryRewrite";

describe("parseQueries", () => {
  it("解析 JSON 数组", () => {
    expect(parseQueries('{"queries":["猫 喂养","猫 常见病"]}')).toEqual(["猫 喂养", "猫 常见病"]);
  });

  it("非法输入返回空", () => {
    expect(parseQueries("not json")).toEqual([]);
    expect(parseQueries('{"queries":[]}')).toEqual([]);
    expect(parseQueries('{"queries":"x"}')).toEqual([]);
  });

  it("截断到 3 条", () => {
    expect(parseQueries('{"queries":["a","b","c","d"]}')).toHaveLength(3);
  });
});

describe("rewriteQuery", () => {
  it("rewrite 取第一条", async () => {
    const completeChat = async (): Promise<string> => '{"queries":["猫的喂养","猫的常见病"]}';
    const result = await rewriteQuery(completeChat, "猫怎么喂", "rewrite");
    expect(result).toEqual(["猫的喂养"]);
  });

  it("multi 取多条", async () => {
    const completeChat = async (): Promise<string> => '{"queries":["猫的喂养","猫的常见病"]}';
    const result = await rewriteQuery(completeChat, "猫怎么喂", "multi");
    expect(result).toEqual(["猫的喂养", "猫的常见病"]);
  });

  it("解析失败回退原 query", async () => {
    const completeChat = async (): Promise<string> => "bad";
    const result = await rewriteQuery(completeChat, "原问题", "rewrite");
    expect(result).toEqual(["原问题"]);
  });
});
