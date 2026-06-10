package com.tsukimiai.hoshi.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.tsukimiai.hoshi")
public class HoshiServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(HoshiServerApplication.class, args);
    }

}
