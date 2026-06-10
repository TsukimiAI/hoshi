package com.tsukimiai.hoshi.infrastructure.config;

import org.apache.ibatis.annotations.Mapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan(basePackages = "com.tsukimiai.hoshi", annotationClass = Mapper.class)
public class MybatisPlusConfiguration {

}
