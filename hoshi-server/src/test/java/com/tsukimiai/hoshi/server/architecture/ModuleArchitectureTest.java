package com.tsukimiai.hoshi.server.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class ModuleArchitectureTest {

    private static final JavaClasses CLASSES = new ClassFileImporter()
            .importPackages("com.tsukimiai.hoshi");

    @Test
    void conversationMustNotDependOnCompanionModule() {
        ArchRule rule = noClasses()
                .that().resideInAnyPackage("com.tsukimiai.hoshi.conversation..")
                .should().dependOnClassesThat().resideInAnyPackage("com.tsukimiai.hoshi.companion..");
        rule.check(CLASSES);
    }

    @Test
    void aiMustNotDependOnConversationModule() {
        ArchRule rule = noClasses()
                .that().resideInAnyPackage("com.tsukimiai.hoshi.ai..")
                .should().dependOnClassesThat().resideInAnyPackage("com.tsukimiai.hoshi.conversation..");
        rule.check(CLASSES);
    }

    @Test
    void commonMustNotDependOnFeatureModules() {
        ArchRule rule = noClasses()
                .that().resideInAnyPackage("com.tsukimiai.hoshi.common..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.tsukimiai.hoshi.conversation..",
                        "com.tsukimiai.hoshi.user..",
                        "com.tsukimiai.hoshi.ai..",
                        "com.tsukimiai.hoshi.companion..",
                        "com.tsukimiai.hoshi.infrastructure..",
                        "com.tsukimiai.hoshi.security..");
        rule.check(CLASSES);
    }

    @Test
    void companionMustNotDependOnConversationModule() {
        ArchRule rule = noClasses()
                .that().resideInAnyPackage("com.tsukimiai.hoshi.companion..")
                .should().dependOnClassesThat().resideInAnyPackage("com.tsukimiai.hoshi.conversation..");
        rule.check(CLASSES);
    }
}
