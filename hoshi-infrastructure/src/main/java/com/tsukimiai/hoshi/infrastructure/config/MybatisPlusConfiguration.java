package com.tsukimiai.hoshi.infrastructure.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.tsukimiai.hoshi")
public class MybatisPlusConfiguration {

}
