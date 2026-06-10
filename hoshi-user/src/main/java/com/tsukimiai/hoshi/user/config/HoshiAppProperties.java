package com.tsukimiai.hoshi.user.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.app")
public class HoshiAppProperties {

    private String publicUrl = "http://localhost:5173";

    public String getPublicUrl() {
        return publicUrl;
    }

    public void setPublicUrl(String publicUrl) {
        this.publicUrl = publicUrl;
    }

}
