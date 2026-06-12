package com.tsukimiai.hoshi.ai.config;

import java.util.ArrayList;
import java.util.List;

public class AiFixedReply {

    /**
     * contains：用户消息包含任一 trigger 即命中（默认）
     * exact：用户消息与任一 trigger 完全一致（忽略首尾空白）才命中
     */
    private String match = "contains";

    private List<String> triggers = new ArrayList<>();

    private String reply = "";

    public String getMatch() {
        return match;
    }

    public void setMatch(String match) {
        this.match = match;
    }

    public List<String> getTriggers() {
        return triggers;
    }

    public void setTriggers(List<String> triggers) {
        this.triggers = triggers == null ? new ArrayList<>() : triggers;
    }

    public String getReply() {
        return reply;
    }

    public void setReply(String reply) {
        this.reply = reply;
    }
}
