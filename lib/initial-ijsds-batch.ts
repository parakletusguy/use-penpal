export const IJSDS_INITIAL_FOLDER = {
  id: "1-6a-amSAmpM27zkqPdqlB5MWQV_4GWSK",
  name: "IJSDS PAPERS",
} as const;

export const IJSDS_INITIAL_MANUSCRIPTS = [
  ["1UdMY4A4R0ZW-czFjTFMRYtmIV93DybUM", "An Examination of the Prevalence Predisposing Factors and Management of Malaria.docx", "2025-10-14T13:24:24.447Z"],
  ["1iAq3uz2G3V1dDF7224U3CBLr3x7k1HiZ", "Impact of Globalization on Indigenous Values and individual Autonomy and Collect.docx", "2025-10-14T13:23:06.128Z"],
  ["1E7lg26yFNxiGCMYZcpK6OhHDZxuTNpfT", "Women’s Role in Promoting Sustainable Communities.docx", "2025-10-14T12:52:29.908Z"],
  ["1mSL6BQVgk5EZojGPu6z7EvcS7Audqje5", "The Social Dynamics of Ageing and Coping Mechanisms of the Older Adult Abuse.docx", "2025-10-14T12:51:31.315Z"],
  ["13MVyiozFg9k8y6dTMFaPNXCYseFkmOUw", "SUBSTANCE USE AMONG YOUTHS.docx", "2025-10-14T12:51:08.008Z"],
  ["1NyVcy_mnBGtFk9heWtCUJYRfoBtngHV2", "Socio-cultural Factors Influencing Mental Health Rehabilitation in Ibadan, Oyo S.docx", "2025-10-14T12:49:47.172Z"],
  ["1oFjx6zDk5mieueWAO5j3Ou2JYFvwJYbW", "Social Works and Community Development in Essien Udim Local Government Area, Akw.docx", "2025-10-14T12:48:58.189Z"],
  ["1W14M99puR-FZ5l-XBuYcSvxWk3u1mo8N", "SOCIAL WORK INTERVENTIONS IN JUVENILE DELINQUENCY CHALLENGES AND PROSPECTS IN.docx", "2025-10-14T12:45:45.500Z"],
  ["1NZ9JtyX6gn3lG8EAqva2GWNzo4WqFthM", "SOCIAL WORK AND DEVELOPMENT IN A CHANGING WORLD.docx", "2025-10-14T12:40:22.044Z"],
  ["1fCil2bTMV0-_qTX7Sm_-cxsY49SDeA2J", "Quantitative Analysis of Enrollees’ Satisfaction with National Health Insurance.docx", "2025-10-14T12:40:03.096Z"],
  ["1vq5udnwRDtIMCTqiSvOG9FcR4Bo0UNcw", "Post-Conflict Resettlement in North-Eastern Nigeria.docx", "2025-10-14T12:39:30.067Z"],
  ["1nb_UglXLzHIGYiGDoux1HXsrJqgUg_nA", "Influence of Family Support on Mental Health of Senior Secondary School Adolesce.docx", "2025-10-14T12:39:14.435Z"],
  ["1lNb0-TejR2nDKcfL0LLav40iqiymyeyS", "FAMILY THERAPY INTERVENTION ON ADOLESCENTS WITH SUBSTANCE ABUSE DISORDER IN YABA.docx", "2025-10-14T12:36:16.651Z"],
  ["1FdCGSah5cGsOm3rAvR_H5ysFRXur2alJ", "Enhancing Social Work Response in Insurgency-Affected Areas.docx", "2025-10-14T12:34:05.566Z"],
  ["1imhIvdRkiGT97Lzejnt-rNW3W2XyTXNi", "emeodu and obuzor on oil RESOURCE CRISIS AND SOCIAL WORK INTERVENTION IN EMOHUA LOCAL GOVERNMENT AREA-1 (1).docx", "2025-10-14T12:33:46.658Z"],
  ["1DobLoLyOInE5CQRmNPOEhq9xY-d00zG_", "EFFECTIVENESS OF SOCIAL CASEWORK METHODS IN THE CORRECTION OF JUVENILE DELINQUEN.docx", "2025-10-14T12:33:29.764Z"],
  ["1fEF_WzaP9oKd0moagu9c70Alu0YfMVxJ", "DIVORCE AND CHILD UPBRINGING  (1).docx", "2025-10-14T12:29:49.389Z"],
  ["1maTmxK82-tW0lzE3f9Zr_lHTaOYWm2U4", "Artificial Intelligence and Human Interaction from the Nigerian Perspective.docx", "2025-10-14T12:29:01.477Z"],
  ["1Ktx7a0MSNXzcb_3fflyPMEBUnD8dtp9o", "Appraisal of Social worker and legal practitioners’ engagement The collaborativ.docx", "2025-10-14T12:26:26.039Z"],
] as const;

export const WORD_DOCUMENT_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function manuscriptTitle(fileName: string) {
  return fileName.replace(/\.docx$/i, "");
}

export function driveFileUrl(fileId: string) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}
