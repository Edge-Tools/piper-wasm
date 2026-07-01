



















#include <stdlib.h>
#include <string.h>

#include <espeak-ng/speak_lib.h>



#define CLAUSE_INTONATION_FULL_STOP 0x00000000
#define CLAUSE_INTONATION_COMMA 0x00001000
#define CLAUSE_INTONATION_QUESTION 0x00002000
#define CLAUSE_INTONATION_EXCLAMATION 0x00003000

#define CLAUSE_TYPE_CLAUSE 0x00040000
#define CLAUSE_TYPE_SENTENCE 0x00080000

#define CLAUSE_PERIOD (40 | CLAUSE_INTONATION_FULL_STOP | CLAUSE_TYPE_SENTENCE)
#define CLAUSE_COMMA (20 | CLAUSE_INTONATION_COMMA | CLAUSE_TYPE_CLAUSE)
#define CLAUSE_QUESTION (40 | CLAUSE_INTONATION_QUESTION | CLAUSE_TYPE_SENTENCE)
#define CLAUSE_EXCLAMATION                                                     \
    (45 | CLAUSE_INTONATION_EXCLAMATION | CLAUSE_TYPE_SENTENCE)
#define CLAUSE_COLON (30 | CLAUSE_INTONATION_FULL_STOP | CLAUSE_TYPE_CLAUSE)
#define CLAUSE_SEMICOLON (30 | CLAUSE_INTONATION_COMMA | CLAUSE_TYPE_CLAUSE)

#define US "\x1f" 
#define RS "\x1e" 



int piper_espeak_init(const char *data_path) {
    return espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, data_path, 0);
}


static int sb_append(char **buf, size_t *len, size_t *cap, const char *s) {
    size_t sl = strlen(s);
    if (*len + sl + 1 > *cap) {
        size_t nc = *cap ? *cap : 1024;
        while (nc < *len + sl + 1) {
            nc *= 2;
        }
        char *nb = realloc(*buf, nc);
        if (!nb) {
            return -1;
        }
        *buf = nb;
        *cap = nc;
    }
    memcpy(*buf + *len, s, sl);
    *len += sl;
    (*buf)[*len] = '\0';
    return 0;
}



char *piper_espeak_phonemize(const char *voice, const char *text) {
    if (espeak_SetVoiceByName(voice) != EE_OK) {
        return NULL;
    }

    char *out = NULL;
    size_t len = 0, cap = 0;
    if (sb_append(&out, &len, &cap, "") != 0) {
        return NULL;
    }

    const void *text_ptr = text;
    int first = 1;
    while (text_ptr != NULL) {
        int terminator = 0;
        const char *phonemes = espeak_TextToPhonemesWithTerminator(
            &text_ptr, espeakCHARS_AUTO, espeakPHONEMES_IPA, &terminator);

        terminator &= 0x000FFFFF;

        const char *term_str = "";
        if (terminator == CLAUSE_PERIOD) {
            term_str = ".";
        } else if (terminator == CLAUSE_QUESTION) {
            term_str = "?";
        } else if (terminator == CLAUSE_EXCLAMATION) {
            term_str = "!";
        } else if (terminator == CLAUSE_COMMA) {
            term_str = ",";
        } else if (terminator == CLAUSE_COLON) {
            term_str = ":";
        } else if (terminator == CLAUSE_SEMICOLON) {
            term_str = ";";
        }

        const char *eos =
            ((terminator & CLAUSE_TYPE_SENTENCE) == CLAUSE_TYPE_SENTENCE) ? "1"
                                                                          : "0";

        if (!first) {
            sb_append(&out, &len, &cap, RS);
        }
        first = 0;

        sb_append(&out, &len, &cap, eos);
        sb_append(&out, &len, &cap, US);
        sb_append(&out, &len, &cap, term_str);
        sb_append(&out, &len, &cap, US);
        sb_append(&out, &len, &cap, phonemes ? phonemes : "");
    }

    return out;
}




int main(void) { return 0; }
