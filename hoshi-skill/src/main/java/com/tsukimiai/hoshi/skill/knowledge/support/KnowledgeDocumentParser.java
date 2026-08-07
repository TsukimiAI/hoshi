package com.tsukimiai.hoshi.skill.knowledge.support;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.util.StringUtils;

public class KnowledgeDocumentParser {

    public String parse(String filename, String contentType, InputStream inputStream) throws Exception {
        String ext = resolveExtension(filename);
        if ("pdf".equals(ext) || (StringUtils.hasText(contentType) && contentType.toLowerCase().contains("pdf"))) {
            return parsePdf(inputStream);
        }
        // treat md/txt as UTF-8 plain text
        return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
    }

    private String parsePdf(InputStream inputStream) throws Exception {
        try (PDDocument doc = Loader.loadPDF(inputStream.readAllBytes())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return stripper.getText(doc);
        }
    }

    private String resolveExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        String name = filename.trim();
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return "";
        }
        return name.substring(dot + 1).trim().toLowerCase(java.util.Locale.ROOT);
    }
}

