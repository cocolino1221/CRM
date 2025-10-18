#!/bin/bash

# Test runner script for SlackCRM Backend
# Provides convenient commands to run different types of tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_color() {
    printf "${!1}%s${NC}\n" "$2"
}

# Print header
print_header() {
    echo
    print_color "BLUE" "=========================================="
    print_color "BLUE" "$1"
    print_color "BLUE" "=========================================="
    echo
}

# Check if PostgreSQL is running
check_postgres() {
    if ! command -v pg_isready &> /dev/null; then
        print_color "RED" "PostgreSQL client tools not found. Please install PostgreSQL."
        exit 1
    fi

    if ! pg_isready -h localhost -p 5432 &> /dev/null; then
        print_color "RED" "PostgreSQL is not running on localhost:5432"
        print_color "YELLOW" "Please start PostgreSQL before running tests."
        exit 1
    fi

    print_color "GREEN" "✅ PostgreSQL is running"
}

# Check if Redis is running (optional)
check_redis() {
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping > /dev/null 2>&1; then
            print_color "GREEN" "✅ Redis is running"
        else
            print_color "YELLOW" "⚠️  Redis is not running (optional for unit tests)"
        fi
    else
        print_color "YELLOW" "⚠️  Redis client not found (optional for unit tests)"
    fi
}

# Setup test databases
setup_databases() {
    print_header "Setting up test databases"

    # Create test databases if they don't exist
    createdb slackcrm_test 2>/dev/null || print_color "YELLOW" "Database 'slackcrm_test' already exists"
    createdb slackcrm_test_e2e 2>/dev/null || print_color "YELLOW" "Database 'slackcrm_test_e2e' already exists"

    print_color "GREEN" "✅ Test databases ready"
}

# Clean test databases
clean_databases() {
    print_header "Cleaning test databases"

    dropdb slackcrm_test 2>/dev/null || true
    dropdb slackcrm_test_e2e 2>/dev/null || true

    createdb slackcrm_test 2>/dev/null || true
    createdb slackcrm_test_e2e 2>/dev/null || true

    print_color "GREEN" "✅ Test databases cleaned"
}

# Run unit tests
run_unit_tests() {
    print_header "Running Unit Tests"

    npm run test -- --passWithNoTests

    if [ $? -eq 0 ]; then
        print_color "GREEN" "✅ Unit tests passed"
    else
        print_color "RED" "❌ Unit tests failed"
        exit 1
    fi
}

# Run integration tests
run_integration_tests() {
    print_header "Running Integration Tests"

    check_postgres
    setup_databases

    # Run integration tests (controllers, services with database)
    npm run test -- --testPathPattern=".*\.(controller|service)\.spec\.ts$" --passWithNoTests

    if [ $? -eq 0 ]; then
        print_color "GREEN" "✅ Integration tests passed"
    else
        print_color "RED" "❌ Integration tests failed"
        exit 1
    fi
}

# Run E2E tests
run_e2e_tests() {
    print_header "Running E2E Tests"

    check_postgres
    setup_databases

    npm run test:e2e

    if [ $? -eq 0 ]; then
        print_color "GREEN" "✅ E2E tests passed"
    else
        print_color "RED" "❌ E2E tests failed"
        exit 1
    fi
}

# Run tests with coverage
run_coverage() {
    print_header "Running Tests with Coverage"

    check_postgres
    setup_databases

    npm run test:cov

    if [ $? -eq 0 ]; then
        print_color "GREEN" "✅ Coverage report generated"
        print_color "BLUE" "📊 Open coverage/lcov-report/index.html to view the report"
    else
        print_color "RED" "❌ Coverage generation failed"
        exit 1
    fi
}

# Run all tests
run_all_tests() {
    print_header "Running All Tests"

    check_postgres
    check_redis
    setup_databases

    print_color "BLUE" "1/3 Running unit tests..."
    run_unit_tests

    print_color "BLUE" "2/3 Running integration tests..."
    run_integration_tests

    print_color "BLUE" "3/3 Running E2E tests..."
    run_e2e_tests

    print_color "GREEN" "🎉 All tests passed!"
}

# Watch mode for development
run_watch() {
    print_header "Running Tests in Watch Mode"

    npm run test:watch
}

# Show help
show_help() {
    echo
    print_color "BLUE" "SlackCRM Backend Test Runner"
    echo
    print_color "YELLOW" "Usage: $0 [COMMAND]"
    echo
    print_color "YELLOW" "Commands:"
    echo "  unit          Run unit tests only"
    echo "  integration   Run integration tests only"
    echo "  e2e          Run E2E tests only"
    echo "  coverage     Run all tests with coverage"
    echo "  all          Run all tests (unit + integration + e2e)"
    echo "  watch        Run tests in watch mode"
    echo "  setup        Setup test databases"
    echo "  clean        Clean and recreate test databases"
    echo "  help         Show this help message"
    echo
    print_color "YELLOW" "Examples:"
    echo "  $0 unit"
    echo "  $0 e2e"
    echo "  $0 coverage"
    echo
}

# Main script logic
case "${1:-help}" in
    "unit")
        run_unit_tests
        ;;
    "integration")
        run_integration_tests
        ;;
    "e2e")
        run_e2e_tests
        ;;
    "coverage")
        run_coverage
        ;;
    "all")
        run_all_tests
        ;;
    "watch")
        run_watch
        ;;
    "setup")
        check_postgres
        setup_databases
        ;;
    "clean")
        check_postgres
        clean_databases
        ;;
    "help"|*)
        show_help
        ;;
esac