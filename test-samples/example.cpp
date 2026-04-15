/**
 * example.cpp
 * Demo C++ source file for testing the Header File Generator extension.
 */

#include <iostream>
#include <string>
#include <vector>
#include <memory>

/* ─── Enumerations ──────────────────────────────────────────────────────────── */

enum class Direction {
    North,
    South,
    East,
    West
};

/* ─── Simple Shape Hierarchy ─────────────────────────────────────────────────── */

class Shape {
public:
    Shape(const std::string& name);
    virtual ~Shape();

    virtual double area() const = 0;
    virtual double perimeter() const = 0;
    virtual void draw() const;

    std::string getName() const;
    void setName(const std::string& name);

protected:
    std::string m_name;

private:
    static int s_instanceCount;
};

int Shape::s_instanceCount = 0;

Shape::Shape(const std::string& name) : m_name(name) {
    ++s_instanceCount;
}

Shape::~Shape() {
    --s_instanceCount;
}

void Shape::draw() const {
    std::cout << "Drawing " << m_name << std::endl;
}

std::string Shape::getName() const {
    return m_name;
}

void Shape::setName(const std::string& name) {
    m_name = name;
}

/* ─── Circle ─────────────────────────────────────────────────────────────────── */

class Circle : public Shape {
public:
    Circle(double radius);
    Circle(double radius, const std::string& name);

    double area() const override;
    double perimeter() const override;
    void draw() const override;

    double getRadius() const;
    void setRadius(double radius);

    static Circle unit();

private:
    double m_radius;
    static constexpr double PI = 3.14159265358979;
};

Circle::Circle(double radius) : Shape("Circle"), m_radius(radius) {}

Circle::Circle(double radius, const std::string& name)
    : Shape(name), m_radius(radius) {}

double Circle::area() const {
    return PI * m_radius * m_radius;
}

double Circle::perimeter() const {
    return 2.0 * PI * m_radius;
}

void Circle::draw() const {
    std::cout << "Drawing Circle(r=" << m_radius << ")" << std::endl;
}

double Circle::getRadius() const { return m_radius; }
void Circle::setRadius(double radius) { m_radius = radius; }
Circle Circle::unit() { return Circle(1.0, "Unit Circle"); }

/* ─── Rectangle ──────────────────────────────────────────────────────────────── */

class Rectangle : public Shape {
public:
    Rectangle(double width, double height);
    ~Rectangle() override;

    double area() const override;
    double perimeter() const override;
    void draw() const override;

    double getWidth() const;
    double getHeight() const;
    bool isSquare() const;

protected:
    double m_width;
    double m_height;
};

Rectangle::Rectangle(double width, double height)
    : Shape("Rectangle"), m_width(width), m_height(height) {}

Rectangle::~Rectangle() {}

double Rectangle::area() const { return m_width * m_height; }
double Rectangle::perimeter() const { return 2.0 * (m_width + m_height); }
void Rectangle::draw() const {
    std::cout << "Drawing Rectangle(" << m_width << "x" << m_height << ")" << std::endl;
}
double Rectangle::getWidth() const { return m_width; }
double Rectangle::getHeight() const { return m_height; }
bool Rectangle::isSquare() const { return m_width == m_height; }

/* ─── Free Utility Functions ─────────────────────────────────────────────────── */

static double degreesToRadians(double degrees) {
    return degrees * 3.14159265358979 / 180.0;
}

double calculateTotalArea(const std::vector<std::shared_ptr<Shape>>& shapes) {
    double total = 0.0;
    for (const auto& s : shapes) {
        total += s->area();
    }
    return total;
}

std::shared_ptr<Shape> createShape(const std::string& type, double param1, double param2) {
    if (type == "circle") {
        return std::make_shared<Circle>(param1);
    } else if (type == "rectangle") {
        return std::make_shared<Rectangle>(param1, param2);
    }
    return nullptr;
}

void printShapeInfo(const Shape& shape) {
    std::cout << shape.getName()
              << " | Area: " << shape.area()
              << " | Perimeter: " << shape.perimeter()
              << std::endl;
}

int main() {
    auto c = std::make_shared<Circle>(5.0);
    auto r = std::make_shared<Rectangle>(4.0, 6.0);

    std::vector<std::shared_ptr<Shape>> shapes = { c, r };
    std::cout << "Total area: " << calculateTotalArea(shapes) << std::endl;

    return 0;
}
