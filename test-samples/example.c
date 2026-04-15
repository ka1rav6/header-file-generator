/**
 * example.c
 * Demo C source file for testing the Header File Generator extension.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

/* ─── Type Definitions ──────────────────────────────────────────────────────── */

#define MAX_NAME_LEN 128
#define VERSION_MAJOR 1
#define VERSION_MINOR 0

typedef unsigned int uint;
typedef char* string_t;

typedef enum Status {
    STATUS_OK = 0,
    STATUS_ERROR,
    STATUS_PENDING,
    STATUS_CANCELLED
} Status;

typedef struct Point {
    float x;
    float y;
} Point;

typedef struct Rectangle {
    Point origin;
    float width;
    float height;
} Rectangle;

struct Node {
    int value;
    struct Node* next;
};

/* ─── Static (Private) Helpers ──────────────────────────────────────────────── */

static int clamp(int value, int min, int max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

static bool is_valid_name(const char* name) {
    return name != NULL && strlen(name) > 0 && strlen(name) < MAX_NAME_LEN;
}

/* ─── Public API ─────────────────────────────────────────────────────────────── */

Point point_create(float x, float y) {
    Point p = { x, y };
    return p;
}

float point_distance(Point a, Point b) {
    float dx = a.x - b.x;
    float dy = a.y - b.y;
    return (float)sqrt((double)(dx * dx + dy * dy));
}

Rectangle rect_create(Point origin, float width, float height) {
    Rectangle r = { origin, width, height };
    return r;
}

float rect_area(Rectangle r) {
    return r.width * r.height;
}

bool rect_contains_point(Rectangle r, Point p) {
    return p.x >= r.origin.x &&
           p.x <= r.origin.x + r.width &&
           p.y >= r.origin.y &&
           p.y <= r.origin.y + r.height;
}

Status process_data(const char* input, char* output, size_t output_size) {
    if (!is_valid_name(input) || output == NULL) {
        return STATUS_ERROR;
    }
    strncpy(output, input, output_size - 1);
    output[output_size - 1] = '\0';
    return STATUS_OK;
}

struct Node* node_create(int value) {
    struct Node* node = (struct Node*)malloc(sizeof(struct Node));
    if (!node) return NULL;
    node->value = value;
    node->next = NULL;
    return node;
}

void node_free(struct Node* node) {
    free(node);
}

void node_list_free(struct Node* head) {
    while (head) {
        struct Node* next = head->next;
        node_free(head);
        head = next;
    }
}

int main(void) {
    Point a = point_create(0.0f, 0.0f);
    Point b = point_create(3.0f, 4.0f);
    printf("Distance: %.2f\n", point_distance(a, b));
    return 0;
}
