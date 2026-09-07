package com.evidencepilot.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailParseException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * Single branded-mail gateway. All user-facing emails go through here so the
 * Evidence Pilot header, CTA button and footer stay identical everywhere.
 * Multipart: HTML body + plain-text fallback. No template engine, no logo
 * asset — the header is a styled text wordmark (see task: code-built HTML).
 */
@Service
public class HtmlMailService {

    private final JavaMailSender mailSender;
    private final String from;

    @Autowired
    public HtmlMailService(
            ObjectProvider<JavaMailSender> mailSenderProvider,
            @Value("${app.mail.from:${MAIL_USERNAME:}}") String from) {
        this(mailSenderProvider.getIfAvailable(), from);
    }

    public HtmlMailService(JavaMailSender mailSender, String from) {
        this.mailSender = mailSender;
        this.from = from;
    }

    public boolean isConfigured() {
        return mailSender != null && from != null && !from.isBlank();
    }

    /**
     * @param to         recipient address
     * @param subject    mail subject line
     * @param heading    H2 headline inside the body card
     * @param introHtml  trusted HTML fragment (paragraph text; senders build it
     *                   from literals and numbers only — never raw user input)
     * @param ctaUrl     null/blank to omit the button
     * @param ctaLabel   button text (ignored when ctaUrl is blank)
     * @param footerNote small-print line under the button; blank to omit
     */
    public void send(String to, String subject, String heading, String introHtml,
            String ctaUrl, String ctaLabel, String footerNote) {
        if (!isConfigured()) {
            throw new IllegalStateException("Mail is not configured");
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(buildText(heading, introHtml, ctaUrl, footerNote),
                    buildHtml(heading, introHtml, ctaUrl, ctaLabel, footerNote));
            mailSender.send(message);
        } catch (MessagingException e) {
            throw new MailParseException("Failed to build email", e);
        }
    }

    private String buildHtml(String heading, String introHtml, String ctaUrl, String ctaLabel, String footerNote) {
        StringBuilder button = new StringBuilder();
        if (ctaUrl != null && !ctaUrl.isBlank()) {
            String label = ctaLabel != null && !ctaLabel.isBlank() ? ctaLabel : "Open link";
            button.append("<p style=\"margin:24px 0;\"><a href=\"").append(ctaUrl)
                    .append("\" style=\"display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px;\">")
                    .append(label).append("</a></p>")
                    .append("<p style=\"font-size:12px;color:#64748b;\">If the button does not work, open this link:<br/><a href=\"")
                    .append(ctaUrl).append("\">").append(ctaUrl).append("</a></p>");
        }
        String footer = (footerNote != null && !footerNote.isBlank())
                ? "<p style=\"font-size:12px;color:#64748b;margin-top:20px;\">" + footerNote + "</p>"
                : "";
        return "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;\">"
                + "<div style=\"max-width:600px;margin:0 auto;padding:24px 12px;\">"
                + "<div style=\"background:#1e3a8a;border-radius:12px 12px 0 0;padding:20px 24px;\">"
                + "<div style=\"color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:2px;\">EVIDENCE PILOT</div>"
                + "<div style=\"color:#c7d2fe;font-size:12px;margin-top:4px;\">Research Evidence Mapping &amp; Citation Traceability</div>"
                + "</div>"
                + "<div style=\"background:#ffffff;border-radius:0 0 12px 12px;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;\">"
                + "<h2 style=\"margin:0 0 12px;font-size:18px;color:#0f172a;\">" + heading + "</h2>"
                + "<div style=\"font-size:14px;line-height:1.6;color:#334155;\">" + introHtml + "</div>"
                + button
                + footer
                + "</div>"
                + "<p style=\"font-size:11px;color:#94a3b8;text-align:center;margin-top:16px;\">Evidence Pilot &copy; 2026</p>"
                + "</div></body></html>";
    }

    private String buildText(String heading, String introHtml, String ctaUrl, String footerNote) {
        StringBuilder text = new StringBuilder(heading).append("\n\n")
                .append(introHtml.replaceAll("<[^>]+>", ""));
        if (ctaUrl != null && !ctaUrl.isBlank()) {
            text.append("\n\n").append(ctaUrl);
        }
        if (footerNote != null && !footerNote.isBlank()) {
            text.append("\n\n").append(footerNote);
        }
        return text.toString();
    }
}
