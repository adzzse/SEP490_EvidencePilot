package com.evidencepilot.config.infrastructure;

import com.evidencepilot.model.ReviewGuide;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.ReviewGuideRepository;
import com.evidencepilot.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Slf4j
@Component
public class DatabaseSeeder implements CommandLineRunner {

    private final ReviewGuideRepository reviewGuideRepository;
    private final ObjectMapper objectMapper;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminEmail;
    private final String adminPassword;
    private final String adminFirstName;
    private final String adminLastName;
    private final String studentEmail;
    private final String studentPassword;
    private final String studentFirstName;
    private final String studentLastName;
    private final String studentCode;
    private final String instructorEmail;
    private final String instructorPassword;
    private final String instructorFirstName;
    private final String instructorLastName;

    @Autowired
    public DatabaseSeeder(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            ReviewGuideRepository reviewGuideRepository,
            ObjectMapper objectMapper,
            @Value("${app.admin.email:}") String adminEmail,
            @Value("${app.admin.password:}") String adminPassword,
            @Value("${app.admin.first-name:Admin}") String adminFirstName,
            @Value("${app.admin.last-name:User}") String adminLastName,
            @Value("${app.student.email:}") String studentEmail,
            @Value("${app.student.password:}") String studentPassword,
            @Value("${app.student.first-name:Test}") String studentFirstName,
            @Value("${app.student.last-name:Student}") String studentLastName,
            @Value("${app.student.student-code:}") String studentCode,
            @Value("${app.instructor.email:}") String instructorEmail,
            @Value("${app.instructor.password:}") String instructorPassword,
            @Value("${app.instructor.first-name:Test}") String instructorFirstName,
            @Value("${app.instructor.last-name:Instructor}") String instructorLastName) {
        this.reviewGuideRepository = reviewGuideRepository;
        this.objectMapper = objectMapper;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.adminFirstName = adminFirstName;
        this.adminLastName = adminLastName;
        this.studentEmail = studentEmail;
        this.studentPassword = studentPassword;
        this.studentFirstName = studentFirstName;
        this.studentLastName = studentLastName;
        this.studentCode = studentCode;
        this.instructorEmail = instructorEmail;
        this.instructorPassword = instructorPassword;
        this.instructorFirstName = instructorFirstName;
        this.instructorLastName = instructorLastName;
    }

    @Override
    public void run(String... args) {
        if ("production".equalsIgnoreCase(System.getenv("APP_ENV"))) {
            throw new IllegalStateException("Seeder execution attempted in production environment. Halting boot.");
        }
        seedReviewGuides();
        seedDemoUsers();
    }

    private void seedDemoUsers() {
        seedUser(adminEmail, adminPassword, adminFirstName, adminLastName, UserRole.ADMIN, null);
        seedUser(studentEmail, studentPassword, studentFirstName, studentLastName, UserRole.STUDENT, studentCode);
        seedUser(instructorEmail, instructorPassword, instructorFirstName, instructorLastName, UserRole.INSTRUCTOR, null);
    }

    private void seedUser(
            String email,
            String password,
            String firstName,
            String lastName,
            UserRole role,
            String studentCode) {
        if (email == null || email.isBlank()
                || password == null || password.isBlank()
                || firstName == null || firstName.isBlank()
                || lastName == null || lastName.isBlank()
                || (role == UserRole.STUDENT && (studentCode == null || studentCode.isBlank()))) {
            log.info("Skipping {} seed account because its required fields are not configured", role);
            return;
        }
        String normEmail = email.trim().toLowerCase(Locale.ROOT);
        String normFirst = firstName.trim();
        String normLast = lastName.trim();
        String normCode = role == UserRole.STUDENT && studentCode != null ? studentCode.trim().toUpperCase(Locale.ROOT) : null;
        User user = userRepository.findByEmail(normEmail).orElseGet(User::new);
        user.setEmail(normEmail);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setFirstName(normFirst);
        user.setLastName(normLast);
        user.setRole(role);
        user.setStudentCode(normCode);
        user.setAccountStatus(AccountStatus.ACTIVE);
        if (user.getCreatedAt() == null) {
            user.setCreatedAt(LocalDateTime.now());
        }
        userRepository.save(user);
        log.info("Ensured {} user: {}", role, normEmail);
    }

    private static final List<ReviewGuideSeed> REVIEW_GUIDES = List.of(
            new ReviewGuideSeed("Abstract",
                    "A strong abstract is self-contained: it states the research question, method, key result, and implication, and stands alone without references.",
                    List.of(
                            "Is the research question stated?",
                            "Is the method summarized in 1-2 sentences?",
                            "Is the main result reported with a direction or numbers?",
                            "Does it mention the implication or contribution?",
                            "Can it be read without the rest of the paper?")),
            new ReviewGuideSeed("Introduction",
                    "A strong introduction establishes the problem, situates it in prior work, states the research question or hypothesis, and previews the approach. Move from broad context to a specific gap, then state the aim.",
                    List.of(
                            "Does it establish the problem and its importance?",
                            "Is the gap or research question explicit?",
                            "Does it review relevant prior work?",
                            "Does it state the aim or hypothesis?",
                            "Does it preview the paper's structure?")),
            new ReviewGuideSeed("Methods",
                    "A strong methods section is reproducible: it describes the design, participants or data, procedures, and analysis in enough detail that another researcher could repeat the study.",
                    List.of(
                            "Is the study design stated?",
                            "Are participants or data described?",
                            "Are procedures step-by-step and reproducible?",
                            "Are analysis techniques specified?",
                            "Is sample size or data volume justified?")),
            new ReviewGuideSeed("Methodology",
                    "A strong methodology section explains and justifies the overall approach and design choices, then describes procedures in reproducible detail.",
                    List.of(
                            "Is the approach justified relative to the research question?",
                            "Are design choices explained?",
                            "Are data collection and analysis procedures reproducible?",
                            "Are limitations of the chosen approach acknowledged?")),
            new ReviewGuideSeed("Results",
                    "A strong results section reports findings objectively, uses the most effective presentation (text, tables, figures), and reports effect sizes or precision where relevant. Interpretation belongs in the Discussion.",
                    List.of(
                            "Are findings reported objectively?",
                            "Are tables/figures appropriate and referenced in the text?",
                            "Are key numbers and effect sizes reported?",
                            "Is the analysis faithful to the methods?",
                            "Is interpretation left to the Discussion?")),
            new ReviewGuideSeed("Discussion",
                    "A strong discussion interprets the results, answers the research question, compares with prior work, acknowledges limitations, and states conclusions or implications.",
                    List.of(
                            "Does it interpret the results?",
                            "Does it answer the research question?",
                            "Does it compare with prior work?",
                            "Are limitations acknowledged?",
                            "Are conclusions or implications stated?")),
            new ReviewGuideSeed("Conclusion",
                    "A strong conclusion restates the main findings, summarizes the contribution, and closes with implications or future work without introducing new evidence.",
                    List.of(
                            "Does it restate the main findings?",
                            "Does it summarize the contribution?",
                            "Are implications or future work mentioned?",
                            "Is no new evidence introduced?")),
            new ReviewGuideSeed("References",
                    "A strong reference list is complete, consistent, and correctly formatted, with every in-text citation matching an entry.",
                    List.of(
                            "Do all in-text citations appear in the list?",
                            "Is the citation style consistent?",
                            "Are entries complete and accurate?")),
            new ReviewGuideSeed("DEFAULT",
                    "General guidance: check whether the section fulfills its purpose, is clear and specific, uses evidence appropriately, and connects to the paper's overall argument.",
                    List.of(
                            "Does the section fulfill its stated purpose?",
                            "Is the writing clear and specific?",
                            "Is evidence used and cited appropriately?",
                            "Does it connect to the paper's overall argument?")));

    private void seedReviewGuides() {
        for (ReviewGuideSeed seed : REVIEW_GUIDES) {
            reviewGuideRepository.findById(seed.type()).ifPresentOrElse(
                    existing -> { /* never overwrite manually tuned content */ },
                    () -> {
                        ReviewGuide guide = new ReviewGuide();
                        guide.setSectionType(seed.type());
                        guide.setGuidance(seed.guidance());
                        guide.setChecklistJson(toChecklistJson(seed.checklist()));
                        guide.setActive(true);
                        reviewGuideRepository.save(guide);
                        log.info("Seeded review guide: {}", seed.type());
                    });
        }
    }

    private String toChecklistJson(List<String> checklist) {
        try {
            return objectMapper.writeValueAsString(checklist);
        } catch (Exception e) {
            return "[]";
        }
    }

    private record ReviewGuideSeed(String type, String guidance, List<String> checklist) {
    }
}
