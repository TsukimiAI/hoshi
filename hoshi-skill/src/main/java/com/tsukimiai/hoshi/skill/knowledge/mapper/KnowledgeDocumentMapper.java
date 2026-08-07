package com.tsukimiai.hoshi.skill.knowledge.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;

@Mapper
public interface KnowledgeDocumentMapper extends BaseMapper<KnowledgeDocument> {
}

