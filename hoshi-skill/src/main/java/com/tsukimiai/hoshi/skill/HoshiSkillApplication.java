package com.tsukimiai.hoshi.skill;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.tsukimiai.hoshi")
public class HoshiSkillApplication {

    public static void main(String[] args) {
        SpringApplication.run(HoshiSkillApplication.class, args);
    }

}
