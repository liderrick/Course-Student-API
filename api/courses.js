const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

const j = require('../lib/jwt');
const ds = require('../lib/datastore');

const datastore = ds.datastore;
const COURSE = ds.COURSE;
const STUDENT = ds.STUDENT;
const USER = ds.USER;
const PAGINATION_LIMIT = ds.PAGINATION_LIMIT;

const checkJwt = j.checkJwt;

const router = express.Router();
router.use(bodyParser.json());

/* ------------- Begin Course Model Functions ------------- */

async function post_course(req, course_number, credits, course_title, email){
    credits = parseInt(credits, 10);
    if(isNaN(credits) || credits < 0) { return Promise.reject("\'credits\' field does not contain a valid value."); }
    var key = datastore.key(COURSE);
    var new_course = {  "course_number": course_number,
                        "credits": credits,
                        "course_title": course_title,
                        "course_owner": { "email": email},
                        "enrolled_students": [] };

    // Check if course_number already exists
    var q_course = datastore.createQuery(COURSE).filter('course_number', '=', course_number);
    await datastore.runQuery(q_course).then( (course_entities) => {
        if(course_entities[0].length !== 0) { throw "That course_number already exists."; }
    });

    return datastore.save({ "key": key, "data": new_course })
    .then( async () => {

        // Add course to user's list
        var q_user = datastore.createQuery(USER).filter('email', '=', email);
        await datastore.runQuery(q_user).then( async (user_entities) => {
            if(user_entities[0] === undefined) { throw "Internal error: Could not add course to user's account."; }
            var user = user_entities[0][0];
            user.owner_of_courses.push( {"id": key.id.toString() } );
            await datastore.update({ "key": user[ds.Datastore.KEY], "data": user });
        });

        new_course = ds.addIDandSelfLinkandCourseOwnerLink(req, new_course, key.id);
        return new_course;
    });
}

async function get_courses(req) {

    // Get course count
    var total_course_count;
    var q_course_count = datastore.createQuery(COURSE);
    await datastore.runQuery(q_course_count).then( (course_entities) => {
        total_course_count = course_entities[0].length;
    });

    var q_course = datastore.createQuery(COURSE).limit(PAGINATION_LIMIT);
    if(Object.keys(req.query).includes("cursor")) {
        q_course = q_course.start(req.query.cursor);
    }
    const results = {};

    return datastore.runQuery(q_course).then( (course_entities) => {
        results.total_course_count = total_course_count;
        results.courses = course_entities[0].map(ds.addIDandSelfLinkandCourseOwnerLinkandStudentCountandRemoveEnrolledStudentsWrapper(req));

        if(course_entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ) {
            results.next = ds.getProtocol(req) + "://" + req.get("host") + req.baseUrl + "?cursor=" + course_entities[1].endCursor;
        }
        return results;
    });
}

function get_course(req, course_id) {
    course_id = parseInt(course_id, 10);
    if(isNaN(course_id)) { return Promise.reject("Invalid course id supplied."); }
    const key = datastore.key([COURSE, course_id]);
    return datastore.get(key).then( async (course_entities) => {
        if (course_entities[0] === undefined) { throw "That course does not exist."; };
        var course = course_entities[0];

        // Get students' full_name
        var student_keys = course.enrolled_students.map( (enrolled_student) => {
            return datastore.key([STUDENT, parseInt(enrolled_student.id, 10)]);
        });
        for (var i in student_keys) {
            await datastore.get(student_keys[i]).then( async (student_entities) => {
                var student = student_entities[0];
                course.enrolled_students[i].full_name = student.full_name;
            });
        }

        course.enrolled_students = course.enrolled_students.map(ds.addStudentLinkWrapper(req));
        course = ds.addIDandSelfLinkandCourseOwnerLink(req, course, course_id);
        return course;
    });
}

function put_course(req, course_id, course_number, credits, course_title, email){
    course_id = parseInt(course_id, 10);
    if(isNaN(course_id)) { return Promise.reject("Invalid course id supplied."); }
    credits = parseInt(credits, 10);
    if(isNaN(credits) || credits < 0) { return Promise.reject("\'credits\' field does not contain a valid value."); }

    var course_key = datastore.key([COURSE, course_id]);
    return datastore.get(course_key)
    .then( async (course_entities) => {
        if (course_entities[0] === undefined) { throw "That course does not exist."; }
        if (course_entities[0].course_owner.email !== email) { throw "You do not have the authorization to edit that course."; }
        var course = course_entities[0];

        // Check if course_number already exists, ignore if self
        var q_course = datastore.createQuery(COURSE).filter('course_number', '=', course_number);
        await datastore.runQuery(q_course).then( (course_entities) => {
            if(course_entities[0].length !== 0 && course.course_number !== course_number) {
                throw "That course_number already exists.";
            }
        });

        var updated_course = {  "course_number": course_number,
                                "credits": credits,
                                "course_title": course_title,
                                "course_owner": { "email": email},
                                "enrolled_students": course.enrolled_students };
        return datastore.update({ "key": course_key, "data": updated_course })
        .then( async () => {

            // Get students' full_name
            var student_keys = updated_course.enrolled_students.map( (enrolled_student) => {
                return datastore.key([STUDENT, parseInt(enrolled_student.id, 10)]);
            });
            for (var i in student_keys) {
                await datastore.get(student_keys[i]).then( async (student_entities) => {
                    var student = student_entities[0];
                    updated_course.enrolled_students[i].full_name = student.full_name;
                });
            }

            updated_course.enrolled_students = updated_course.enrolled_students.map(ds.addStudentLinkWrapper(req));
            updated_course = ds.addIDandSelfLinkandCourseOwnerLink(req, updated_course, course_id);
            return updated_course;
        });
    });
}

function delete_course(req, course_id, email) {
    course_id = parseInt(course_id, 10);
    if(isNaN(course_id)) { return Promise.reject("Invalid course id supplied."); }
    var course_key = datastore.key([COURSE, course_id]);
    return datastore.get(course_key)
    .then( async (course_entities) => {
        if (course_entities[0] === undefined) { throw "That course does not exist."; }
        if (course_entities[0].course_owner.email !== email) { throw "You do not have the authorization to delete that course."; }
        var course = course_entities[0];

        // Delete course from User's list
        var q_user = datastore.createQuery(USER).filter('email', '=', email);
        await datastore.runQuery(q_user).then( async (user_entities) => {
            if(user_entities[0] === undefined) { throw "Internal error: Could not remove course from user's account."; }
            var user = user_entities[0][0];
            var updated_owner_of_courses = user.owner_of_courses.filter( (value) => {
                return value.id.toString() !== course_id.toString();
            });
            var updated_user = {    "full_name": user.full_name,
                                    "department": user.department,
                                    "start_date": user.start_date,
                                    "email": user.email,
                                    "owner_of_courses": updated_owner_of_courses };
            await datastore.update({ "key": user[ds.Datastore.KEY], "data": updated_user });
        });

        // Remove course from students' schedule_of_courses
        var student_keys = course.enrolled_students.map( (enrolled_student) => {
            return datastore.key([STUDENT, parseInt(enrolled_student.id, 10)]);
        });
        for (let s_key of student_keys) {
            await datastore.get(s_key).then( async (student_entities) => {
                var student = student_entities[0];
                var updated_schedule_of_courses = student.schedule_of_courses.filter( (value) => {
                    return value.id.toString() !== course_id.toString();
                });
                var updated_student = { "full_name": student.full_name,
                                        "graduation_year": student.graduation_year,
                                        "major": student.major,
                                        "schedule_of_courses": updated_schedule_of_courses  };
                await datastore.update({ "key": s_key, "data": updated_student });
            });
        }

        return datastore.delete(course_key);
    });
}

function assign_student_to_course(req, student_id, course_id, email) {
    student_id = parseInt(student_id, 10);
    course_id = parseInt(course_id, 10);
    if (isNaN(student_id)) { return Promise.reject("Invalid student id supplied."); }
    if (isNaN(course_id)) { return Promise.reject("Invalid course id supplied."); }
    const course_key = datastore.key([COURSE, parseInt(course_id, 10)]);
    const student_key = datastore.key([STUDENT, parseInt(student_id, 10)]);
    return datastore.get(course_key).then( async (course_entities) => {
        if (course_entities[0] === undefined) { throw "That course does not exist."; }
        if (course_entities[0].course_owner.email !== email) { throw "You do not have the authorization to put students in that course."; }

        var course = course_entities[0];

        // Check if student is already assigned to that course
        course.enrolled_students.forEach( (enrolled_student) => {
            if (enrolled_student.id.toString() === student_id.toString()) { throw "That student is already in that course."; }
        });

        course.enrolled_students.push({ "id": student_id.toString() });

        await datastore.get(student_key).then( async (student_entities) => {
            if (student_entities[0] === undefined) { throw "That student does not exist."; }
            var student = student_entities[0];
            student.schedule_of_courses.push({ "id": course_id.toString() });
            await datastore.update({ "key": student_key, "data": student })
        });

        return datastore.update({ "key": course_key, "data": course })
        .then( () => {
            course.enrolled_students = course.enrolled_students.map(ds.addStudentLinkWrapper(req));
            course = ds.addIDandSelfLinkandCourseOwnerLink(req, course, course_id);
            return course;
        });

    });
}

function remove_student_from_course(req, student_id, course_id, email) {
    student_id = parseInt(student_id, 10);
    course_id = parseInt(course_id, 10);
    if (isNaN(student_id)) { return Promise.reject("Invalid student id supplied."); }
    if (isNaN(course_id)) { return Promise.reject("Invalid course id supplied."); }
    const course_key = datastore.key([COURSE, parseInt(course_id, 10)]);
    const student_key = datastore.key([STUDENT, parseInt(student_id, 10)]);
    return datastore.get(course_key).then( async (course_entities) => {
        if (course_entities[0] === undefined) { throw "That course does not exist."; }
        if (course_entities[0].course_owner.email !== email) { throw "You do not have the authorization to remove students from that course."; }
        var course = course_entities[0];

        // Remove student from course's enrolled_students
        var updated_enrolled_students = course.enrolled_students.filter( (value) => {
            return value.id.toString() !== student_id.toString()
        });

        await datastore.get(student_key).then( async (student_entities) => {
            if (student_entities[0] === undefined) { throw "That student does not exist."; }
            var student = student_entities[0];

            // Remove course from student's schedule_of_course, if exists
            var foundCourse = false;
            var updated_schedule_of_courses = student.schedule_of_courses.filter( (value) => {
                if (value.id.toString() === course_id.toString()) {
                    foundCourse = true;
                    return false;
                } else {
                    return true;
                }
            });
            if (foundCourse !== true) { throw "That student is not in that course."}

            var updated_student = { "full_name": student.full_name,
                                    "graduation_year": student.graduation_year,
                                    "major": student.major,
                                    "schedule_of_courses": updated_schedule_of_courses  };

            await datastore.update({ "key": student_key, "data": updated_student })
        });

        var updated_course = {  "course_number": course.course_number,
                                "credits": course.credits,
                                "course_title": course.course_title,
                                "course_owner": { "email": email},
                                "enrolled_students": updated_enrolled_students };

        return datastore.update({ "key": course_key, "data": updated_course })
        .then( () => {
            updated_course.enrolled_students = updated_course.enrolled_students.map(ds.addStudentLinkWrapper(req));
            updated_course = ds.addIDandSelfLinkandCourseOwnerLink(req, updated_course, course_id);
            return updated_course;
        });
    });
}

/* ------------- End Course Model Functions ------------- */

/* ------------- Begin Course Controller Functions ------------- */

router.post('/', checkJwt, function(req, res) {
    console.log("POST course:", req.body);
    if(req.get('Content-Type') !== 'application/json'){
        res.status(415).send("Server can only accept 'application/json'."); return;
    }
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    if(!req.body.course_number || !req.body.credits || !req.body.course_title) {
        res.status(400).send("The following properties are required: course_number, credits, and course_title."); return;
    }
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        post_course(req, req.body.course_number, req.body.credits, req.body.course_title, req.user.name)
        .then( (new_course) => {
            res.location(new_course.self);
            res.status(201).json(new_course);
        }, (err) => {
            res.status(400).send(err);
        });
    }
});

router.get('/', function(req, res) {
    console.log("GET courses.");
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    get_courses(req)
    .then( (courses) => {
        res.status(200).json(courses);
    }, (err) => {
        res.status(400).end();
    });
});

router.get('/:id', function(req, res) {
    console.log("GET course:", req.params.id);
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    get_course(req, req.params.id)
    .then( (course) => {
        res.status(200).json(course);
    }, (err) => {
        if (err === "That course does not exist.") {
            res.status(404).send(err);
        } else {
            res.status(400).send(err);
        }
    });
});

router.put('/:id', checkJwt, function(req, res){
    console.log("PUT course: id = " + req.params.id + ",", req.body);
    if(req.get('Content-Type') !== 'application/json'){
        res.status(415).send("Server can only accept 'application/json'."); return;
    }
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    if(!req.body.course_number || !req.body.credits || !req.body.course_title) {
        res.status(400).send("The following properties are required: course_number, credits, and course_title."); return;
    }
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        put_course(req, req.params.id, req.body.course_number, req.body.credits, req.body.course_title, req.user.name)
        .then( (updated_course) => {
            res.location(updated_course.self);
            res.status(200).json(updated_course);
        }, (err) => {
            if (err === "That course does not exist.") {
                res.status(404).send(err);
            } else if (err === "You do not have the authorization to edit that course.") {
                res.status(403).send(err);
            } else {
                res.status(400).send(err);
            }
        });
    }
});

router.delete('/:id', checkJwt, function(req, res){
    console.log("DELETE course:", req.params.id);
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        delete_course(req, req.params.id, req.user.name)
        .then( () => {
            res.status(204).end();
        }, (err) => {
            if (err === "That course does not exist.") {
                res.status(404).send(err);
            } else if (err === "You do not have the authorization to delete that course.") {
                res.status(403).send(err);
            } else {
                res.status(400).send(err);
            }
        });
    }
});

router.put('/:course_id/students/:student_id', checkJwt, function(req, res){
    console.log("PUT student to course:", req.params.student_id, "to", req.params.course_id);
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        assign_student_to_course(req, req.params.student_id, req.params.course_id, req.user.name)
        .then( (updated_course) => {
            res.location(updated_course.self);
            res.status(200).send("Student successfully added to course.");
        }, (err) => {
            if (err === "That course does not exist." || err === "That student does not exist.") {
                res.status(404).send(err);
            } else if (err === "You do not have the authorization to put students in that course.") {
                res.status(403).send(err);
            } else {
                res.status(400).send(err);
            }
        });
    }
});

router.delete('/:course_id/students/:student_id', checkJwt, function(req, res){
    console.log("DELETE student from course:", req.params.student_id, "from", req.params.course_id);
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        remove_student_from_course(req, req.params.student_id, req.params.course_id, req.user.name)
        .then( (updated_course) => {
            res.location(updated_course.self);
            res.status(200).send("Student successfully removed from course.");
        }, (err) => {
            if (err === "That course does not exist." || err === "That student does not exist.") {
                res.status(404).send(err);
            } else if (err === "You do not have the authorization to remove students from that course.") {
                res.status(403).send(err);
            } else {
                res.status(400).send(err);
            }
        });
    }
});

router.put('/', function(req, res) {
    res.set("Allow", "GET, POST");
    res.status(405).end();
});

router.delete('/', function(req, res) {
    res.set("Allow", "GET, POST");
    res.status(405).end();
});

router.post('/:id', function(req, res) {
    res.set("Allow", "GET, PUT, DELETE");
    res.status(405).end();
});

router.post('/:course_id/students/:student_id', function(req, res) {
    res.set("Allow", "PUT, DELETE");
    res.status(405).end();
});

router.get('/:course_id/students/:student_id', function(req, res) {
    res.set("Allow", "PUT, DELETE");
    res.status(405).end();
});

/* ------------- End Course Controller Functions ------------- */

module.exports = router;