package com.tsukimiai.hoshi.user.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tsukimiai.hoshi.user.entity.EmailCode;

@Mapper
public interface EmailCodeMapper extends BaseMapper<EmailCode> {

}
