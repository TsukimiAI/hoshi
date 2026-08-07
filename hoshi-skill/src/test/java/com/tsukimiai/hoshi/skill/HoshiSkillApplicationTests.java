package com.tsukimiai.hoshi.skill;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(classes = {HoshiSkillApplication.class, TestVectorStoreConfiguration.class})
@ActiveProfiles("test")
class HoshiSkillApplicationTests {

    @Test
    void contextLoads() {
    }

}
